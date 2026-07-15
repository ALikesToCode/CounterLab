from __future__ import annotations

import copy

from counterlab_kernel import generate_leakage_fixture, run_leakage_experiment
from counterlab_kernel.canonical import sha256_json
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


def test_technical_verifier_releases_a_valid_inconclusive_outcome() -> None:
    candidate = copy.deepcopy(
        run_leakage_experiment(generate_leakage_fixture(seed=1729), seed=1729)
    )
    accuracies = {
        "random_row_split": 0.70,
        "customer_group_split": 0.64,
        "identity_ablation": 0.66,
    }
    for run in candidate["runs"]:
        run["metrics"]["accuracy"] = accuracies[run["id"]]
    for row in candidate["chartData"]:
        row["accuracy"] = accuracies[row["runId"]]
    candidate["resultHash"] = sha256_json(
        {key: value for key, value in candidate.items() if key != "resultHash"}
    )

    report = verify_candidate(candidate)

    assert report["status"] == "VERIFIED"
    assert "bounded_kernel_outcomes" in report["verifiedInvariants"]
