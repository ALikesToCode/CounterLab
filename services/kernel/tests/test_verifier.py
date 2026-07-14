from __future__ import annotations

from counterlab_kernel import generate_leakage_fixture, run_leakage_experiment
from counterlab_kernel.verifier import critical_mutations, verify_candidate


def test_reference_result_passes_external_verifier() -> None:
    result = run_leakage_experiment(generate_leakage_fixture(seed=1729), seed=1729)
    report = verify_candidate(result)

    assert report["status"] == "VERIFIED"
    assert report["failures"] == []


def test_every_published_critical_mutation_is_rejected() -> None:
    reference = run_leakage_experiment(generate_leakage_fixture(seed=1729), seed=1729)
    mutations = critical_mutations(reference)

    assert len(mutations) >= 10
    for mutation in mutations:
        report = verify_candidate(mutation["candidate"])
        assert report["status"] == "REJECTED", mutation["id"]
        assert mutation["expectedInvariant"] in {
            failure["invariant"] for failure in report["failures"]
        }, mutation["id"]

