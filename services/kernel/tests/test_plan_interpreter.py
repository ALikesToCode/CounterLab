from __future__ import annotations

from copy import deepcopy

import pytest

from counterlab_kernel.canonical import sha256_json
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
