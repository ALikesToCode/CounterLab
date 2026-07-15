from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pandas as pd
import pytest
from jsonschema import Draft202012Validator

from counterlab_kernel.imbalance import (
    generate_imbalance_fixture,
    run_imbalance_experiment,
)
from counterlab_kernel.imbalance_verifier import (
    critical_imbalance_mutations,
    verify_imbalance_candidate,
)


ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "concept-packs/imbalance/public"
VERIFIER = ROOT / "concept-packs/imbalance/verifier"
FIXTURES = ROOT / "fixtures"


def _sdk():
    spec = importlib.util.spec_from_file_location(
        "counterlab_imbalance_public_sdk", PUBLIC / "counterlab_sdk.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_public_sample_plan_is_schema_valid_and_declarative() -> None:
    schema = json.loads(
        (PUBLIC / "experiment-plan.schema.json").read_text(encoding="utf-8")
    )
    plan = json.loads(
        (PUBLIC / "sample-experiment-plan.json").read_text(encoding="utf-8")
    )
    Draft202012Validator(schema).validate(plan)
    assert [run["operation"] for run in plan["runs"]] == [
        "imbalance.majority_baseline",
        "imbalance.stratified_holdout",
        "imbalance.threshold_sweep",
        "imbalance.prevalence_sweep",
    ]
    assert "accuracy_score" not in (PUBLIC / "counterlab_sdk.py").read_text(
        encoding="utf-8"
    )


def test_public_sdk_allows_only_the_four_fixed_interventions() -> None:
    sdk = _sdk()
    experiment = sdk.sample_experiment(seed=2603)
    contract = experiment.to_dict()
    assert len(contract["runs"]) == 4

    with pytest.raises(ValueError, match="majority"):
        sdk.Run(
            id="accuracy_only",
            operation="imbalance.majority_baseline",
            model="logistic_regression",
            threshold=0.5,
            prevalence_scenario="observed",
            seed=2603,
        )


def test_hidden_verifier_catalogue_matches_executable_invariants_and_mutations() -> None:
    reference = run_imbalance_experiment(generate_imbalance_fixture())
    report = verify_imbalance_candidate(reference)
    invariants = json.loads(
        (VERIFIER / "invariants.json").read_text(encoding="utf-8")
    )
    mutations = json.loads(
        (VERIFIER / "mutations.json").read_text(encoding="utf-8")
    )

    assert set(invariants["requiredInvariants"]) <= set(report["verifiedInvariants"])
    assert {item["id"] for item in mutations["mutations"]} == {
        item["id"] for item in critical_imbalance_mutations(reference)
    }


def test_public_fixture_result_and_notebook_outputs_share_computed_truth() -> None:
    fixture_path = FIXTURES / "public/fraud_rare_event.csv"
    result_path = FIXTURES / "public/imbalance_verified_result.json"
    notebook_path = FIXTURES / "notebooks/fraud_class_imbalance.ipynb"

    frame = pd.read_csv(fixture_path)
    stored_result = json.loads(result_path.read_text(encoding="utf-8"))
    computed_result = run_imbalance_experiment(frame)
    notebook = json.loads(notebook_path.read_text(encoding="utf-8"))

    assert stored_result == computed_result
    assert verify_imbalance_candidate(stored_result)["status"] == "VERIFIED"
    assert notebook["nbformat"] == 4
    stored_text = "\n".join(
        "".join(output.get("text", []))
        for cell in notebook["cells"]
        for output in cell.get("outputs", [])
        if output.get("output_type") == "stream"
    )
    majority = next(
        run
        for run in stored_result["runs"]
        if run["operation"] == "imbalance.majority_baseline"
    )
    assert f"{majority['metrics']['accuracy']:.6f}" in stored_text
    assert f"{majority['metrics']['recall']:.6f}" in stored_text
