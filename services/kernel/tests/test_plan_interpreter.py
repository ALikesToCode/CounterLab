from __future__ import annotations

from copy import deepcopy

import pytest

from counterlab_kernel.canonical import sha256_json, sha256_json_browser
from counterlab_kernel.fixture import generate_leakage_fixture
from counterlab_kernel.plan import (
    ExperimentPlanValidationError,
    interpret_experiment_plan,
    validate_experiment_plan,
)
from counterlab_kernel.hosted_run import (
    HostedLabRunError,
    execute_hosted_lab_run,
)


HASH = "b" * 64
CLAIM = "The notebook accuracy proves generalization to new customers."


def manifest() -> dict[str, object]:
    schema_summary = {
        "fields": [
            {
                "name": "customer_id",
                "inferredType": "categorical",
                "privacyClass": "entity_identifier",
            }
        ],
        "rowCount": 2880,
        "entityCandidates": ["customer_id"],
        "targetCandidates": ["churned"],
    }
    return {
        "artifactId": "artifact_live_1",
        "fileName": "uploaded.ipynb",
        "fileSha256": "a" * 64,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 3,
                "type": "code",
                "sourceSha256": "c" * 64,
                "sourceExcerpt": "train_test_split(X, y, random_state=1729)",
                "executionCount": 4,
                "outputHashes": [HASH],
                "symbols": ["train_test_split", "accuracy_score"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.9847, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": schema_summary,
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-15T00:00:00.000Z",
    }


def plan() -> dict[str, object]:
    return {
        "schemaVersion": "2",
        "planId": "plan_live_1",
        "sessionId": "session_live_1",
        "concept": "entity_leakage",
        "conceptPackVersion": "2.0.0",
        "artifactManifestHash": sha256_json(manifest()),
        "beliefTestId": "belief_live_1",
        "evidenceRefs": [
            {
                "cellIndex": 3,
                "outputIndex": 0,
                "kind": "metric",
                "hash": HASH,
                "excerpt": "accuracy 0.9847",
                "relevance": "This is the learner's claimed result.",
            }
        ],
        "baseline": {
            "concept": "entity_leakage",
            "runId": "random_rows",
            "operation": "leakage.random_row_split",
            "seed": 1729,
            "testFraction": 0.25,
            "entityField": "customer_id",
            "dropIdentity": False,
            "model": "logistic_regression",
        },
        "interventions": [
            {
                "concept": "entity_leakage",
                "runId": "new_customers",
                "operation": "leakage.group_holdout",
                "seed": 1729,
                "testFraction": 0.25,
                "entityField": "customer_id",
                "dropIdentity": False,
                "model": "logistic_regression",
            },
            {
                "concept": "entity_leakage",
                "runId": "without_identity",
                "operation": "leakage.identity_ablation",
                "seed": 1729,
                "testFraction": 0.25,
                "entityField": "customer_id",
                "dropIdentity": True,
                "model": "logistic_regression",
            },
        ],
        "controlledVariables": ["fixture", "model", "seed"],
        "changedVariables": ["split boundary", "identity feature"],
        "metrics": ["accuracy", "roc_auc", "entity_overlap_rate"],
        "visualizations": ["metric_comparison", "entity_overlap"],
        "discriminatesBecause": (
            "Only the shortcut hypothesis predicts a drop for unseen customers."
        ),
        "expectedPatterns": [
            {
                "hypothesisId": "current",
                "qualitativeOutcome": "Accuracy remains high.",
            },
            {
                "hypothesisId": "competing",
                "qualitativeOutcome": "Accuracy falls with zero overlap.",
            },
        ],
        "nonClaims": ["This does not prove performance on every population."],
        "resourceLimits": {"wallSeconds": 30, "memoryMb": 512, "maxRuns": 4},
    }


def test_plan_schema_and_evidence_are_validated_before_execution() -> None:
    validated = validate_experiment_plan(plan(), manifest(), learner_claim=CLAIM)
    assert validated["schemaVersion"] == "2"

    executable = {**plan(), "shell": "python artifact-adapter.py"}
    with pytest.raises(ExperimentPlanValidationError, match="schema"):
        validate_experiment_plan(executable, manifest(), learner_claim=CLAIM)

    unresolved = deepcopy(plan())
    unresolved["evidenceRefs"][0]["hash"] = "f" * 64  # type: ignore[index]
    with pytest.raises(ExperimentPlanValidationError, match="evidence"):
        validate_experiment_plan(unresolved, manifest(), learner_claim=CLAIM)


def test_plan_rejects_cross_concept_and_unknown_entity_fields() -> None:
    crossed = deepcopy(plan())
    crossed["interventions"][0]["concept"] = "class_imbalance"  # type: ignore[index]
    with pytest.raises(ExperimentPlanValidationError, match="concept|schema"):
        validate_experiment_plan(crossed, manifest(), learner_claim=CLAIM)

    unknown_entity = deepcopy(plan())
    unknown_entity["baseline"]["entityField"] = "account_number"  # type: ignore[index]
    with pytest.raises(ExperimentPlanValidationError, match="entity"):
        validate_experiment_plan(unknown_entity, manifest(), learner_claim=CLAIM)


def test_fixed_interpreter_executes_only_declared_runs_deterministically() -> None:
    fixture = generate_leakage_fixture()
    first = interpret_experiment_plan(plan(), manifest(), fixture, learner_claim=CLAIM)
    second = interpret_experiment_plan(plan(), manifest(), fixture, learner_claim=CLAIM)

    assert [run["id"] for run in first["runs"]] == [
        "random_rows",
        "new_customers",
        "without_identity",
    ]
    assert first["runs"][1]["entityOverlap"]["count"] == 0
    assert first["resultHash"] == second["resultHash"]
    assert first["planId"] == "plan_live_1"
    assert first["seed"] == 1729


def test_hosted_lab_run_binds_plan_manifest_claim_and_fixture() -> None:
    experiment_plan = plan()
    artifact_manifest = manifest()
    bundle = {
        "schemaVersion": "1",
        "kind": "LAB_RUN",
        "purpose": "AUTHORITATIVE",
        "jobId": "job_run_1",
        "sessionId": "session_live_1",
        "stateVersion": 6,
        "artifactManifestHash": sha256_json(artifact_manifest),
        "artifactManifest": artifact_manifest,
        "learnerClaim": CLAIM,
        "experimentPlan": experiment_plan,
        "experimentPlanHash": sha256_json(experiment_plan),
        "fixture": {"id": "public-leakage-v1"},
        "permittedOutputs": ["verified-result.json"],
    }

    result = execute_hosted_lab_run(bundle)

    assert result["schemaVersion"] == "2"
    assert result["sessionId"] == bundle["sessionId"]
    assert result["artifactManifestHash"] == bundle["artifactManifestHash"]
    assert result["planId"] == experiment_plan["planId"]

    tampered = deepcopy(bundle)
    tampered["experimentPlanHash"] = "0" * 64
    with pytest.raises(HostedLabRunError, match="plan hash"):
        execute_hosted_lab_run(tampered)


def test_v5_hosted_lab_run_validates_selected_ir_and_fixed_fixture_authority() -> None:
    projected_plan = plan()
    projected_plan["changedVariables"] = ["split_boundary", "identity_feature"]
    artifact_manifest = manifest()
    candidate_id = "group-holdout-plus-ablation"
    belief_spec = {
        "schemaVersion": "2",
        "id": projected_plan["beliefTestId"],
        "concept": "entity_leakage",
        "claim": CLAIM,
        "evidenceRefs": projected_plan["evidenceRefs"],
        "hypotheses": [
            {
                "id": "current",
                "statement": "The row score generalizes to unseen customers.",
                "conditions": ["The deployment unit is a customer."],
                "nonClaims": ["This does not prove every future population."],
                "evidence": projected_plan["evidenceRefs"],
                "supportedCandidateExperimentIds": [candidate_id],
            },
            {
                "id": "competing",
                "statement": "Repeated identity inflates the row score.",
                "conditions": ["Customer identity repeats across rows."],
                "nonClaims": ["This does not prove every future population."],
                "evidence": projected_plan["evidenceRefs"],
                "supportedCandidateExperimentIds": [candidate_id],
            },
        ],
        "alternatives": [],
        "uncertainty": 0.15,
        "supportState": "SUPPORTED",
        "learnerDecision": "CONFIRMED",
    }
    belief_spec_hash = sha256_json_browser(belief_spec)
    prediction_base = {
        "schemaVersion": "1",
        "id": "prediction_live_1",
        "sessionId": projected_plan["sessionId"],
        "beliefTestId": belief_spec["id"],
        "choice": "The row score remains high.",
        "confidence": 72,
        "committedAt": "2026-07-15T00:00:00.000Z",
    }
    prediction = {
        **prediction_base,
        "immutableHash": sha256_json_browser(prediction_base),
    }
    fixed_selection = {
        "eligibleCandidateIds": [candidate_id],
        "rejectedCandidates": [],
        "selectedCandidateId": candidate_id,
        "minimumSeparation": 0.82,
        "requiredSeparation": 0.4,
        "complexityCost": 5,
        "normalizedScore": 0.8,
        "scorerVersion": "experiment-scorer-v1",
    }
    selected_ir = {
        "schemaVersion": "5",
        "irId": "ir-live-1",
        "executionPlanId": projected_plan["planId"],
        "sessionId": projected_plan["sessionId"],
        "concept": "entity_leakage",
        "conceptPackVersion": projected_plan["conceptPackVersion"],
        "artifactManifestHash": projected_plan["artifactManifestHash"],
        "beliefSpecId": belief_spec["id"],
        "beliefSpecHash": belief_spec_hash,
        "evidenceRefs": projected_plan["evidenceRefs"],
        "hypotheses": [
            {
                "id": "current",
                "statement": belief_spec["hypotheses"][0]["statement"],  # type: ignore[index]
                "conditions": belief_spec["hypotheses"][0]["conditions"],  # type: ignore[index]
                "nonClaims": belief_spec["hypotheses"][0]["nonClaims"],  # type: ignore[index]
                "predictedPattern": {
                    "patternId": "leakage.small-gap",
                    "description": projected_plan["expectedPatterns"][0]["qualitativeOutcome"],  # type: ignore[index]
                },
            },
            {
                "id": "competing",
                "statement": belief_spec["hypotheses"][1]["statement"],  # type: ignore[index]
                "conditions": belief_spec["hypotheses"][1]["conditions"],  # type: ignore[index]
                "nonClaims": belief_spec["hypotheses"][1]["nonClaims"],  # type: ignore[index]
                "predictedPattern": {
                    "patternId": "leakage.material-gap",
                    "description": projected_plan["expectedPatterns"][1]["qualitativeOutcome"],  # type: ignore[index]
                },
            },
        ],
        "candidateExperiments": [
            {
                "id": candidate_id,
                "title": "Hold out complete customers",
                "operationIds": [
                    "leakage.random_row_split",
                    "leakage.group_holdout",
                    "leakage.identity_ablation",
                ],
                "baseline": projected_plan["baseline"],
                "interventions": projected_plan["interventions"],
                "heldConstantIds": [
                    f"control.{value}"
                    for value in projected_plan["controlledVariables"]  # type: ignore[union-attr]
                ],
                "changedVariableIds": [
                    f"change.{value}"
                    for value in projected_plan["changedVariables"]  # type: ignore[union-attr]
                ],
                "observableIds": projected_plan["metrics"],
                "hypothesisPatterns": [
                    {
                        "hypothesisId": "current",
                        "patternId": "leakage.small-gap",
                    },
                    {
                        "hypothesisId": "competing",
                        "patternId": "leakage.material-gap",
                    },
                ],
                "inconclusiveConditionIds": ["gap-within-tolerance"],
                "complexityCost": 5,
                "discriminatesBecause": projected_plan["discriminatesBecause"],
            }
        ],
        "selection": {
            "status": "SELECTED",
            "candidateId": candidate_id,
            "eligibleCandidateIds": fixed_selection["eligibleCandidateIds"],
            "rejectedCandidates": fixed_selection["rejectedCandidates"],
            "minimumSeparation": fixed_selection["minimumSeparation"],
            "requiredSeparation": fixed_selection["requiredSeparation"],
            "complexityCost": fixed_selection["complexityCost"],
            "normalizedScore": fixed_selection["normalizedScore"],
            "scorerVersion": fixed_selection["scorerVersion"],
        },
        "visualizations": projected_plan["visualizations"],
        "inconclusiveConditions": [
            {
                "id": "gap-within-tolerance",
                "description": "The observed gap is not decisive.",
            }
        ],
        "transfer": {
            "taskId": "forecast-future-leakage-v1",
            "changedSurface": "Time-ordered forecasting",
            "requiredActionIds": ["time_ordered_holdout"],
            "nonClaims": ["This transfer does not certify mastery."],
        },
        "nonClaims": projected_plan["nonClaims"],
        "provenance": {
            "kind": "codex",
            "generatorId": "codex-app-server-stdio-v1",
            "promptHash": "1" * 64,
            "inputHashes": ["2" * 64],
        },
        "limitations": ["This result is scoped to the fixed fixture."],
        "resourceLimits": projected_plan["resourceLimits"],
    }
    fixture = {
        "id": "public-leakage-v1",
        "version": "leakage-fixture-v1",
        "contentSha256": (
            "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70"
        ),
    }
    expected_hashes = {
        "artifactManifest": sha256_json_browser(artifact_manifest),
        "beliefSpec": belief_spec_hash,
        "prediction": prediction["immutableHash"],
        "fixtureDescriptor": sha256_json_browser(fixture),
        "compileInputBundle": "3" * 64,
        "rawExperimentIrFile": "4" * 64,
        "rawExperimentIrCanonical": "5" * 64,
        "candidateVerificationReport": "6" * 64,
        "experimentSelection": sha256_json_browser(fixed_selection),
        "selectedExperimentIr": sha256_json_browser(selected_ir),
        "projectedPlan": sha256_json_browser(projected_plan),
    }
    bundle = {
        "schemaVersion": "5",
        "kind": "LAB_RUN",
        "purpose": "AUTHORITATIVE",
        "jobId": "job_run_v5_1",
        "sessionId": projected_plan["sessionId"],
        "stateVersion": 8,
        "artifactManifestHash": expected_hashes["artifactManifest"],
        "approvedBeliefSpec": belief_spec,
        "beliefSpecHash": belief_spec_hash,
        "prediction": prediction,
        "artifactManifest": artifact_manifest,
        "fixture": fixture,
        "selectedExperimentIr": selected_ir,
        "selectedExperimentIrHash": expected_hashes["selectedExperimentIr"],
        "fixedSelection": fixed_selection,
        "projectedPlan": projected_plan,
        "expectedHashes": expected_hashes,
        "provenance": {
            "compileJobId": "compile_job_v5_1",
            "compileInputBundleHash": expected_hashes["compileInputBundle"],
            "compilerOutputFileHashes": {
                "discrimination-contract.json": "7" * 64,
                "experiment-ir.json": expected_hashes["rawExperimentIrFile"],
                "lab-scene.json": "8" * 64,
                "public-rationale.md": "9" * 64,
            },
            "rawExperimentIrCanonicalHash": expected_hashes[
                "rawExperimentIrCanonical"
            ],
            "scientificVerifierVersion": "scientific-candidate-verifier-v1",
            "candidateVerificationReportHash": expected_hashes[
                "candidateVerificationReport"
            ],
            "scorerVersion": "experiment-scorer-v1",
            "projectionAdapterVersion": "experiment-ir-v5-to-plan-v2-v1",
        },
        "resultOutput": {
            "path": "verified-result.json",
            "schemaVersion": "2",
            "authoritativeInputHashes": expected_hashes,
        },
        "permittedOutputs": ["verified-result.json"],
    }

    result = execute_hosted_lab_run(bundle)

    assert result["schemaVersion"] == "2"
    assert result["planId"] == projected_plan["planId"]
    assert result["fixture"]["sha256"] == fixture["contentSha256"]  # type: ignore[index]

    tampered = deepcopy(bundle)
    tampered["selectedExperimentIrHash"] = "0" * 64
    with pytest.raises(HostedLabRunError, match="selected Experiment IR hash"):
        execute_hosted_lab_run(tampered)

    executable_ir = deepcopy(bundle)
    executable_ir["selectedExperimentIr"]["shell"] = "python candidate.py"  # type: ignore[index]
    with pytest.raises(HostedLabRunError, match="Experiment IR schema"):
        execute_hosted_lab_run(executable_ir)
