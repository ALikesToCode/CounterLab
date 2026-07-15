from __future__ import annotations

from copy import deepcopy

from counterlab_kernel.imbalance import (
    canonical_imbalance_run_specs,
    generate_imbalance_fixture,
    run_imbalance_experiment,
    run_imbalance_plan,
)
from counterlab_kernel.imbalance_verifier import (
    critical_imbalance_mutations,
    verify_imbalance_candidate,
)


def _v2_reference() -> dict[str, object]:
    return run_imbalance_plan(
        generate_imbalance_fixture(),
        canonical_imbalance_run_specs(2603),
        plan_id="mutation-reference-imbalance-v2",
        session_id="mutation-benchmark",
        artifact_manifest_hash="a" * 64,
        concept_pack_version="1.0.0",
    )


def test_fixed_imbalance_result_passes_named_invariants() -> None:
    result = run_imbalance_experiment(generate_imbalance_fixture())
    report = verify_imbalance_candidate(result)

    assert report["status"] == "VERIFIED"
    assert report["failures"] == []
    assert {
        "required_operations",
        "confusion_metric_consistency",
        "majority_baseline_behavior",
        "minority_signal",
        "threshold_tradeoff",
        "prevalence_sensitivity",
        "declared_variable_control",
        "chart_payload_matches",
        "canonical_result_hash",
    } <= set(report["verifiedInvariants"])


def test_every_published_imbalance_mutation_is_detected() -> None:
    reference = _v2_reference()
    mutations = critical_imbalance_mutations(reference)

    assert len(mutations) >= 19
    assert len({mutation["id"] for mutation in mutations}) == len(mutations)
    for mutation in mutations:
        report = verify_imbalance_candidate(mutation["candidate"])
        assert report["status"] == "REJECTED", mutation["id"]
        assert mutation["expectedInvariant"] in {
            failure["invariant"] for failure in report["failures"]
        }, mutation["id"]


def test_malformed_imbalance_candidate_has_structured_rejection() -> None:
    report = verify_imbalance_candidate({"concept": "class_imbalance"})

    assert report["status"] == "REJECTED"
    assert report["verifiedInvariants"] == []
    assert set(report["failures"][0]) == {
        "invariant",
        "observed",
        "expected",
        "counterexample",
    }


def test_v2_requires_complete_lineage_and_control_fingerprints() -> None:
    reference = _v2_reference()
    assert verify_imbalance_candidate(reference)["status"] == "VERIFIED"

    missing_manifest = deepcopy(reference)
    missing_manifest.pop("artifactManifestHash")
    assert verify_imbalance_candidate(missing_manifest)["failures"][0][
        "invariant"
    ] == "result_contract"

    malformed_manifest = deepcopy(reference)
    malformed_manifest["artifactManifestHash"] = "not-a-sha256"
    assert verify_imbalance_candidate(malformed_manifest)["failures"][0][
        "invariant"
    ] == "result_contract"

    stripped = deepcopy(reference)
    for run in stripped["runs"]:
        run.pop("pipelineFingerprint")
        run.pop("evaluationSetFingerprint")
        run.pop("scoreFingerprint")
    assert verify_imbalance_candidate(stripped)["failures"][0][
        "invariant"
    ] == "result_contract"

    mixed = deepcopy(reference)
    mixed["runs"][0].pop("pipelineFingerprint")
    mixed["runs"][0].pop("evaluationSetFingerprint")
    mixed["runs"][0].pop("scoreFingerprint")
    assert verify_imbalance_candidate(mixed)["failures"][0][
        "invariant"
    ] == "result_contract"

    mixed_v1 = run_imbalance_experiment(generate_imbalance_fixture())
    mixed_v1["runs"][0].pop("pipelineFingerprint")
    mixed_v1["runs"][0].pop("evaluationSetFingerprint")
    mixed_v1["runs"][0].pop("scoreFingerprint")
    assert verify_imbalance_candidate(mixed_v1)["failures"][0][
        "invariant"
    ] == "result_contract"
