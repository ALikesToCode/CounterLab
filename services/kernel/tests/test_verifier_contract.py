from __future__ import annotations

import copy
import hashlib
import json

from counterlab_kernel.verifier import critical_mutations, verify_candidate


def _sha256_json(value: object) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def reference_candidate() -> dict[str, object]:
    runs = [
        {
            "id": "random_row_split",
            "splitStrategy": "random",
            "groupBy": None,
            "model": "logistic_regression",
            "seed": 1729,
            "dropFeatures": [],
            "metrics": {"accuracy": 0.97, "rocAuc": 0.98},
            "entityOverlap": {"count": 432, "rate": 1.0},
            "sampleSizes": {"train": 2160, "test": 720},
            "entityCounts": {"train": 480, "test": 432},
            "featureSetFingerprint": "a" * 64,
            "inputFingerprint": "c" * 64,
        },
        {
            "id": "customer_group_split",
            "splitStrategy": "group",
            "groupBy": "customer_id",
            "model": "logistic_regression",
            "seed": 1729,
            "dropFeatures": [],
            "metrics": {"accuracy": 0.66, "rocAuc": 0.68},
            "entityOverlap": {"count": 0, "rate": 0.0},
            "sampleSizes": {"train": 2160, "test": 720},
            "entityCounts": {"train": 360, "test": 120},
            "featureSetFingerprint": "a" * 64,
            "inputFingerprint": "c" * 64,
        },
        {
            "id": "identity_ablation",
            "splitStrategy": "random",
            "groupBy": None,
            "model": "logistic_regression",
            "seed": 1729,
            "dropFeatures": ["customer_id"],
            "metrics": {"accuracy": 0.65, "rocAuc": 0.67},
            "entityOverlap": {"count": 432, "rate": 1.0},
            "sampleSizes": {"train": 2160, "test": 720},
            "entityCounts": {"train": 480, "test": 432},
            "featureSetFingerprint": "b" * 64,
            "inputFingerprint": "c" * 64,
        },
    ]
    candidate: dict[str, object] = {
        "schemaVersion": "1",
        "concept": "entity_leakage",
        "fixture": {"sha256": "c" * 64, "rows": 2880, "customers": 480},
        "kernelVersion": "0.1.0",
        "seed": 1729,
        "runs": runs,
        "chartData": [
            {
                "runId": run["id"],
                "accuracy": run["metrics"]["accuracy"],  # type: ignore[index]
                "rocAuc": run["metrics"]["rocAuc"],  # type: ignore[index]
                "sampleSize": run["sampleSizes"]["test"],  # type: ignore[index]
                "splitStrategy": run["splitStrategy"],
                "seed": run["seed"],
            }
            for run in runs
        ],
    }
    candidate["resultHash"] = _sha256_json(candidate)
    return candidate


def test_complete_reference_contract_is_verified() -> None:
    report = verify_candidate(reference_candidate())

    assert report["status"] == "VERIFIED"
    assert report["failures"] == []
    assert report["verifiedInvariants"]


def test_result_hash_covers_every_canonical_field() -> None:
    candidate = reference_candidate()
    changed = copy.deepcopy(candidate)
    changed["fixture"]["rows"] = 2879  # type: ignore[index]

    report = verify_candidate(changed)

    assert report["status"] == "REJECTED"
    assert "reproducible_result" in {
        failure["invariant"] for failure in report["failures"]
    }


def test_run_input_fingerprint_must_match_the_fixture() -> None:
    candidate = reference_candidate()
    candidate["runs"][1]["inputFingerprint"] = "d" * 64  # type: ignore[index]
    candidate["resultHash"] = _sha256_json(
        {key: value for key, value in candidate.items() if key != "resultHash"}
    )

    report = verify_candidate(candidate)

    assert "declared_variable_control" in {
        failure["invariant"] for failure in report["failures"]
    }


def test_chart_split_and_seed_provenance_must_match_the_run() -> None:
    candidate = reference_candidate()
    candidate["chartData"][0]["splitStrategy"] = "group"  # type: ignore[index]
    candidate["resultHash"] = _sha256_json(
        {key: value for key, value in candidate.items() if key != "resultHash"}
    )

    report = verify_candidate(candidate)

    assert "chart_payload_matches" in {
        failure["invariant"] for failure in report["failures"]
    }


def test_fractional_sample_counts_are_rejected_as_malformed() -> None:
    candidate = reference_candidate()
    candidate["runs"][0]["sampleSizes"]["test"] = 719.5  # type: ignore[index]
    candidate["resultHash"] = _sha256_json(
        {key: value for key, value in candidate.items() if key != "resultHash"}
    )

    report = verify_candidate(candidate)

    assert report["failures"][0]["invariant"] == "result_contract"


def test_every_seeded_mutation_targets_a_distinct_critical_check() -> None:
    mutations = critical_mutations(reference_candidate())
    mutation_ids = {mutation["id"] for mutation in mutations}
    expected_invariants = {mutation["expectedInvariant"] for mutation in mutations}

    assert len(mutations) >= 12
    assert len(mutation_ids) == len(mutations)
    assert {
        "zero_group_overlap",
        "metrics_are_computed",
        "declared_variable_control",
        "identity_feature_removed",
        "row_order_invariance",
        "reproducible_result",
        "chart_payload_matches",
        "network_isolation",
        "resource_limits_enforced",
        "discriminating_plan",
        "hidden_artifact_isolation",
        "supported_case_only",
    } <= expected_invariants

    for mutation in mutations:
        report = verify_candidate(mutation["candidate"])
        assert report["status"] == "REJECTED", mutation["id"]
        assert mutation["expectedInvariant"] in {
            failure["invariant"] for failure in report["failures"]
        }, mutation["id"]


def test_malformed_candidate_is_rejected_with_structured_counterexample() -> None:
    report = verify_candidate({"schemaVersion": "1", "runs": "not-a-list"})

    assert report["status"] == "REJECTED"
    failure = report["failures"][0]
    assert set(failure) == {"invariant", "observed", "expected", "counterexample"}
    assert failure["invariant"] == "result_contract"
