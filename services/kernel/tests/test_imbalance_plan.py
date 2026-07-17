from __future__ import annotations

from copy import deepcopy

import pytest

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.hosted_run import (
    HostedLabRunError,
    _derive_interactive_plan_v5,
    execute_hosted_lab_run,
)
from counterlab_kernel.imbalance import generate_imbalance_fixture
from counterlab_kernel.plan import (
    ExperimentPlanValidationError,
    interpret_experiment_plan,
    validate_experiment_plan,
)


CLAIM = "The 97% accuracy proves this detector catches rare fraud."
OUTPUT_HASH = "d" * 64


def manifest() -> dict[str, object]:
    schema_summary = {
        "fields": [
            {
                "name": "fraud",
                "inferredType": "integer",
                "privacyClass": "target",
            }
        ],
        "rowCount": 6000,
        "entityCandidates": [],
        "targetCandidates": ["fraud"],
    }
    return {
        "artifactId": "artifact_imbalance_1",
        "fileName": "rare-event.ipynb",
        "fileSha256": "a" * 64,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 4,
                "type": "code",
                "sourceSha256": "c" * 64,
                "sourceExcerpt": "print(accuracy_score(y_test, predictions))",
                "executionCount": 5,
                "outputHashes": [OUTPUT_HASH],
                "symbols": ["accuracy_score", "train_test_split"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.97, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": schema_summary,
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-15T00:00:00.000Z",
    }


def plan() -> dict[str, object]:
    def run(
        run_id: str,
        operation: str,
        *,
        model: str,
        threshold: float,
        prevalence: str,
    ) -> dict[str, object]:
        return {
            "concept": "class_imbalance",
            "runId": run_id,
            "operation": operation,
            "seed": 2603,
            "threshold": threshold,
            "prevalenceScenario": prevalence,
            "model": model,
        }

    return {
        "schemaVersion": "2",
        "planId": "plan_imbalance_1",
        "sessionId": "session_imbalance_1",
        "concept": "class_imbalance",
        "conceptPackVersion": "1.0.0",
        "artifactManifestHash": sha256_json(manifest()),
        "beliefTestId": "belief_imbalance_1",
        "evidenceRefs": [
            {
                "cellIndex": 4,
                "outputIndex": 0,
                "kind": "metric",
                "hash": OUTPUT_HASH,
                "excerpt": "accuracy 0.97",
                "relevance": "The reported metric omits minority-class behavior.",
            }
        ],
        "baseline": run(
            "accuracy_only",
            "imbalance.majority_baseline",
            model="majority_baseline",
            threshold=0.5,
            prevalence="observed",
        ),
        "interventions": [
            run(
                "minority_metrics",
                "imbalance.stratified_holdout",
                model="logistic_regression",
                threshold=0.5,
                prevalence="observed",
            ),
            run(
                "lower_decision_threshold",
                "imbalance.threshold_sweep",
                model="logistic_regression",
                threshold=0.25,
                prevalence="observed",
            ),
            run(
                "rarer_deployment",
                "imbalance.prevalence_sweep",
                model="logistic_regression",
                threshold=0.25,
                prevalence="rarer",
            ),
        ],
        "controlledVariables": ["fixture", "split", "model score", "seed"],
        "changedVariables": ["metric", "threshold", "prevalence"],
        "metrics": [
            "accuracy",
            "precision",
            "recall",
            "f1",
            "pr_auc",
            "roc_auc",
            "confusion_matrix",
            "prevalence",
        ],
        "visualizations": [
            "metric_comparison",
            "confusion_matrix",
            "threshold_curve",
            "prevalence_sensitivity",
        ],
        "discriminatesBecause": (
            "Only the competing hypothesis predicts high accuracy with zero "
            "minority recall and threshold/prevalence sensitivity."
        ),
        "expectedPatterns": [
            {
                "hypothesisId": "current",
                "qualitativeOutcome": "High accuracy implies useful detection.",
            },
            {
                "hypothesisId": "competing",
                "qualitativeOutcome": "Minority recall can be zero despite high accuracy.",
            },
        ],
        "nonClaims": ["This does not select a production threshold."],
        "resourceLimits": {"wallSeconds": 30, "memoryMb": 512, "maxRuns": 4},
    }


def test_imbalance_plan_requires_the_fixed_discriminating_operations() -> None:
    validated = validate_experiment_plan(plan(), manifest(), learner_claim=CLAIM)
    assert validated["concept"] == "class_imbalance"

    crossed = deepcopy(plan())
    crossed["baseline"]["model"] = "logistic_regression"  # type: ignore[index]
    with pytest.raises(ExperimentPlanValidationError, match="majority|operation"):
        validate_experiment_plan(crossed, manifest(), learner_claim=CLAIM)

    missing = deepcopy(plan())
    missing["interventions"] = missing["interventions"][:-1]  # type: ignore[index]
    with pytest.raises(ExperimentPlanValidationError, match="operations"):
        validate_experiment_plan(missing, manifest(), learner_claim=CLAIM)


def test_fixed_interpreter_executes_imbalance_plan_deterministically() -> None:
    fixture = generate_imbalance_fixture()
    first = interpret_experiment_plan(plan(), manifest(), fixture, learner_claim=CLAIM)
    second = interpret_experiment_plan(plan(), manifest(), fixture, learner_claim=CLAIM)

    assert first["schemaVersion"] == "2"
    assert first["concept"] == "class_imbalance"
    assert [run["id"] for run in first["runs"]] == [
        "accuracy_only",
        "minority_metrics",
        "lower_decision_threshold",
        "rarer_deployment",
    ]
    assert first["resultHash"] == second["resultHash"]


@pytest.mark.parametrize(
    "prevalence_scenario",
    ["observed", "rarer", "more_common"],
)
def test_interactive_scenario_keeps_threshold_comparison_valid(
    prevalence_scenario: str,
) -> None:
    configuration = {
        "schemaVersion": "1",
        "concept": "class_imbalance",
        "threshold": 0.2,
        "prevalenceScenario": prevalence_scenario,
        "metricFocus": "recall",
    }
    derived, selected_run_id = _derive_interactive_plan_v5(
        plan(),
        configuration,
        "f" * 64,
    )

    validated = validate_experiment_plan(derived, manifest(), learner_claim=CLAIM)
    result = interpret_experiment_plan(
        validated,
        manifest(),
        generate_imbalance_fixture(),
        learner_claim=CLAIM,
    )
    threshold = next(
        run
        for run in validated["interventions"]
        if run["operation"] == "imbalance.threshold_sweep"
    )
    prevalence = next(
        run
        for run in validated["interventions"]
        if run["operation"] == "imbalance.prevalence_sweep"
    )

    assert threshold["runId"] == (
        selected_run_id
        if prevalence_scenario == "observed"
        else "lower_decision_threshold"
    )
    assert threshold["threshold"] == 0.2
    assert threshold["prevalenceScenario"] == "observed"
    assert prevalence["runId"] == (
        "rarer_deployment"
        if prevalence_scenario == "observed"
        else selected_run_id
    )
    assert prevalence["threshold"] == 0.2
    assert prevalence["prevalenceScenario"] == (
        "rarer" if prevalence_scenario == "observed" else prevalence_scenario
    )
    assert any(run["id"] == selected_run_id for run in result["runs"])


def test_stored_v1_imbalance_interactive_derivation_remains_reproducible() -> None:
    derived, selected_run_id = _derive_interactive_plan_v5(
        plan(),
        {
            "schemaVersion": "1",
            "concept": "class_imbalance",
            "threshold": 0.25,
            "prevalenceScenario": "rarer",
            "metricFocus": "recall",
        },
        "e" * 64,
        "interactive-plan-v5-derivation-v1",
    )

    validated = validate_experiment_plan(derived, manifest(), learner_claim=CLAIM)
    result = interpret_experiment_plan(
        validated,
        manifest(),
        generate_imbalance_fixture(),
        learner_claim=CLAIM,
    )

    assert any(run["id"] == selected_run_id for run in result["runs"])


def test_v1_derivation_preserves_historical_selection_only_behavior() -> None:
    derived, selected_run_id = _derive_interactive_plan_v5(
        plan(),
        {
            "schemaVersion": "1",
            "concept": "class_imbalance",
            "threshold": 0.2,
            "prevalenceScenario": "rarer",
            "metricFocus": "recall",
        },
        "d" * 64,
        "interactive-plan-v5-derivation-v1",
    )
    threshold = next(
        run
        for run in derived["interventions"]
        if run["operation"] == "imbalance.threshold_sweep"
    )
    prevalence = next(
        run
        for run in derived["interventions"]
        if run["operation"] == "imbalance.prevalence_sweep"
    )

    assert threshold["runId"] == "lower_decision_threshold"
    assert threshold["threshold"] == 0.25
    assert prevalence["runId"] == selected_run_id
    assert prevalence["threshold"] == 0.2


def test_stored_v1_derivation_rejects_invalid_interactive_controls() -> None:
    with pytest.raises(
        HostedLabRunError,
        match="class-imbalance interactive configuration is invalid",
    ):
        _derive_interactive_plan_v5(
            plan(),
            {
                "schemaVersion": "1",
                "concept": "class_imbalance",
                "threshold": 0.25,
                "prevalenceScenario": "rarer",
                "metricFocus": "accuracy",
            },
            "e" * 64,
            "interactive-plan-v5-derivation-v1",
        )


def test_hosted_runner_uses_only_the_registered_imbalance_fixture() -> None:
    experiment_plan = plan()
    artifact_manifest = manifest()
    bundle = {
        "schemaVersion": "1",
        "kind": "LAB_RUN",
        "purpose": "AUTHORITATIVE",
        "jobId": "job_imbalance_1",
        "sessionId": "session_imbalance_1",
        "stateVersion": 7,
        "artifactManifestHash": sha256_json(artifact_manifest),
        "artifactManifest": artifact_manifest,
        "learnerClaim": CLAIM,
        "experimentPlan": experiment_plan,
        "experimentPlanHash": sha256_json(experiment_plan),
        "fixture": {"id": "public-imbalance-v1"},
        "permittedOutputs": ["verified-result.json"],
    }

    result = execute_hosted_lab_run(bundle)
    assert result["concept"] == "class_imbalance"
    assert result["planId"] == "plan_imbalance_1"

    wrong_fixture = deepcopy(bundle)
    wrong_fixture["fixture"] = {"id": "public-leakage-v1"}
    with pytest.raises(ValueError, match="fixture"):
        execute_hosted_lab_run(wrong_fixture)
