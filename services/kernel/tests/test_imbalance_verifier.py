from __future__ import annotations

from counterlab_kernel.imbalance import (
    generate_imbalance_fixture,
    run_imbalance_experiment,
)
from counterlab_kernel.imbalance_verifier import (
    critical_imbalance_mutations,
    verify_imbalance_candidate,
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
    reference = run_imbalance_experiment(generate_imbalance_fixture())
    mutations = critical_imbalance_mutations(reference)

    assert len(mutations) >= 10
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
