"""Host-side verification and seeded mutation checks for the leakage lab.

The verifier accepts only canonical kernel output.  Optional probe metadata lets
the host attach evidence from active mutation and sandbox runs without making the
fixed numeric kernel claim that an operating-system boundary was enforced.
"""

from __future__ import annotations

import copy
import math
from collections.abc import Mapping, Sequence
from typing import Any

from .canonical import sha256_json


REQUIRED_RUN_IDS = (
    "random_row_split",
    "customer_group_split",
    "identity_ablation",
)
_SUPPLEMENTAL_KEYS = frozenset(
    {"probes", "plan", "resourceEnforcement", "isolation", "support"}
)
_HASH_LENGTH = 64
_LIMIT_SCOPES = {
    "container-cgroup-and-process-rlimit": {
        "aggregate": True,
        "scopes": {
            "wallSeconds": "request-deadline-and-process-cpu-rlimit",
            "memoryMb": "container-cgroup-and-process-address-space-rlimit",
            "maxProcesses": "container-cgroup-and-process-count-rlimit",
            "maxFiles": "host-output-postcondition",
            "maxOutputBytes": "process-file-rlimit-and-host-output-postcondition",
        },
    },
    "process-rlimit-with-unenforced-cgroup-intent": {
        "aggregate": False,
        "scopes": {
            "wallSeconds": "request-deadline-and-process-cpu-rlimit",
            "memoryMb": "per-process-data-segment-rlimit",
            "maxProcesses": "real-user-process-count-rlimit",
            "maxFiles": "host-output-postcondition",
            "maxOutputBytes": "process-file-rlimit-and-host-output-postcondition",
        },
    },
    "process-address-space-rlimit-with-unenforced-cgroup-intent": {
        "aggregate": False,
        "scopes": {
            "wallSeconds": "request-deadline-and-process-cpu-rlimit",
            "memoryMb": "per-process-address-space-rlimit",
            "maxProcesses": "real-user-process-count-rlimit",
            "maxFiles": "host-output-postcondition",
            "maxOutputBytes": "process-file-rlimit-and-host-output-postcondition",
        },
    },
}


def _canonical_payload(candidate: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in candidate.items()
        if key != "resultHash" and key not in _SUPPLEMENTAL_KEYS
    }


def _result_hash(candidate: Mapping[str, Any]) -> str:
    return sha256_json(_canonical_payload(candidate))


def _is_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_sha256(value: object) -> bool:
    if not isinstance(value, str) or len(value) != _HASH_LENGTH:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True


def _safe_type(value: object) -> str:
    return type(value).__name__


def _failure(
    invariant: str,
    observed: object,
    expected: object,
    counterexample: str,
) -> dict[str, object]:
    return {
        "invariant": invariant,
        "observed": observed,
        "expected": expected,
        "counterexample": counterexample,
    }


def _mapping(value: object) -> Mapping[str, Any] | None:
    return value if isinstance(value, Mapping) else None


def _sequence(value: object) -> Sequence[Any] | None:
    if isinstance(value, Sequence) and not isinstance(
        value, (str, bytes, bytearray)
    ):
        return value
    return None


def _run_index(candidate: Mapping[str, Any]) -> dict[str, Mapping[str, Any]] | None:
    runs = _sequence(candidate.get("runs"))
    if runs is None:
        return None
    index: dict[str, Mapping[str, Any]] = {}
    for run in runs:
        run_mapping = _mapping(run)
        if run_mapping is None or not isinstance(run_mapping.get("id"), str):
            return None
        run_id = run_mapping["id"]
        if run_id in index:
            return None
        index[run_id] = run_mapping
    return index


def _append_once(
    failures: list[dict[str, object]], failure: dict[str, object]
) -> None:
    if not any(item["invariant"] == failure["invariant"] for item in failures):
        failures.append(failure)


def _validate_core_contract(candidate: object) -> dict[str, object] | None:
    if not isinstance(candidate, Mapping):
        return _failure(
            "result_contract",
            {"type": _safe_type(candidate)},
            "mapping with canonical leakage result fields",
            "The candidate result is not a JSON object.",
        )
    required = {
        "schemaVersion",
        "concept",
        "fixture",
        "kernelVersion",
        "seed",
        "runs",
        "chartData",
        "resultHash",
    }
    missing = sorted(required.difference(candidate))
    if missing or _sequence(candidate.get("runs")) is None:
        return _failure(
            "result_contract",
            {
                "missing": missing,
                "runsType": _safe_type(candidate.get("runs")),
            },
            "all canonical fields and a runs array",
            "The canonical result envelope is incomplete or malformed.",
        )
    if (
        candidate.get("schemaVersion") != "1"
        or candidate.get("concept") != "entity_leakage"
        or not isinstance(candidate.get("kernelVersion"), str)
        or not _is_int(candidate.get("seed"))
        or _mapping(candidate.get("fixture")) is None
        or _sequence(candidate.get("chartData")) is None
        or not isinstance(candidate.get("resultHash"), str)
    ):
        return _failure(
            "result_contract",
            {
                "schemaVersion": candidate.get("schemaVersion"),
                "concept": candidate.get("concept"),
                "fixtureType": _safe_type(candidate.get("fixture")),
                "chartDataType": _safe_type(candidate.get("chartData")),
            },
            "CounterLab leakage result schema version 1",
            "One or more envelope fields have the wrong type or value.",
        )
    return None


def _validate_run_contract(
    run_id: str, run: Mapping[str, Any]
) -> dict[str, object] | None:
    metrics = _mapping(run.get("metrics"))
    overlap = _mapping(run.get("entityOverlap"))
    sizes = _mapping(run.get("sampleSizes"))
    entity_counts = _mapping(run.get("entityCounts"))
    required = {
        "id",
        "splitStrategy",
        "groupBy",
        "model",
        "seed",
        "dropFeatures",
        "metrics",
        "entityOverlap",
        "sampleSizes",
        "entityCounts",
        "featureSetFingerprint",
        "inputFingerprint",
    }
    if (
        required.difference(run)
        or metrics is None
        or overlap is None
        or sizes is None
        or entity_counts is None
    ):
        return _failure(
            "result_contract",
            {"runId": run_id, "missing": sorted(required.difference(run))},
            "complete run contract",
            f"Run {run_id} is missing required structured fields.",
        )
    if (
        _sequence(run.get("dropFeatures")) is None
        or not _is_sha256(run.get("featureSetFingerprint"))
        or not _is_sha256(run.get("inputFingerprint"))
        or (
            "pipelineFingerprint" in run
            and not _is_sha256(run.get("pipelineFingerprint"))
        )
        or not isinstance(run.get("model"), str)
        or not _is_int(run.get("seed"))
        or not all(_is_number(metrics.get(name)) for name in ("accuracy", "rocAuc"))
        or not _is_int(overlap.get("count"))
        or not _is_number(overlap.get("rate"))
        or not all(_is_int(sizes.get(name)) for name in ("train", "test"))
        or not all(_is_int(entity_counts.get(name)) for name in ("train", "test"))
    ):
        return _failure(
            "result_contract",
            {"runId": run_id, "fieldTypes": "invalid"},
            "finite metrics, overlap, sample sizes, and SHA-256 fingerprint",
            f"Run {run_id} contains malformed numeric or provenance fields.",
        )
    return None


def _verify_optional_evidence(
    candidate: Mapping[str, Any],
    failures: list[dict[str, object]],
    verified: list[str],
    limitations: list[str],
) -> None:
    probes = _mapping(candidate.get("probes"))
    if probes is None:
        limitations.append("Active label, row-order, and repeat-run probes were not attached.")
    else:
        label = _mapping(probes.get("labelMutation"))
        if label is None or label.get("metricsChanged") is not True:
            _append_once(
                failures,
                _failure(
                    "metrics_are_computed",
                    False if label is None else label.get("metricsChanged"),
                    True,
                    "Changing labels did not change the reported metrics.",
                ),
            )
        else:
            verified.append("metrics_are_computed")

        row_order = _mapping(probes.get("rowReordering"))
        if row_order is None or row_order.get("canonicalHashMatches") is not True:
            _append_once(
                failures,
                _failure(
                    "row_order_invariance",
                    False
                    if row_order is None
                    else row_order.get("canonicalHashMatches"),
                    True,
                    "Reordering input rows changed the canonical result.",
                ),
            )
        else:
            verified.append("row_order_invariance")

        repeat = _mapping(probes.get("reproducibility"))
        if repeat is None or repeat.get("sameSeedHashMatches") is not True:
            _append_once(
                failures,
                _failure(
                    "reproducible_result",
                    False if repeat is None else repeat.get("sameSeedHashMatches"),
                    True,
                    "A repeated run with the same seed produced a different hash.",
                ),
            )
        else:
            verified.append("repeat_run_reproducibility")

    plan = _mapping(candidate.get("plan"))
    if plan is None:
        limitations.append("The generated experiment-plan discrimination probe was not attached.")
    else:
        hypotheses = _sequence(plan.get("competingHypotheses"))
        discrimination = _sequence(plan.get("expectedDiscrimination"))
        valid = (
            hypotheses is not None
            and len(hypotheses) == 2
            and all(isinstance(item, str) and item.strip() for item in hypotheses)
            and hypotheses[0] != hypotheses[1]
            and discrimination is not None
            and len(discrimination) >= 2
        )
        if not valid:
            _append_once(
                failures,
                _failure(
                    "discriminating_plan",
                    {
                        "hypothesisCount": 0 if hypotheses is None else len(hypotheses),
                        "predictionCount": 0
                        if discrimination is None
                        else len(discrimination),
                    },
                    "two distinct hypotheses and at least two predicted run outcomes",
                    "The plan does not predict observably different outcomes.",
                ),
            )
        else:
            verified.append("discriminating_plan")

    resources = _mapping(candidate.get("resourceEnforcement"))
    if resources is None:
        limitations.append("OS network and resource-limit evidence was not attached.")
    else:
        if resources.get("networkDenied") is not True:
            _append_once(
                failures,
                _failure(
                    "network_isolation",
                    resources.get("networkDenied"),
                    True,
                    "The no-network enforcement probe did not report denial.",
                ),
            )
        else:
            verified.append("network_isolation")
        limits = _mapping(resources.get("limits"))
        required_limits = {
            "wallSeconds",
            "memoryMb",
            "maxProcesses",
            "maxFiles",
            "maxOutputBytes",
        }
        failed_limits = sorted(
            name
            for name in required_limits
            if limits is None or limits.get(name) is not True
        )
        limit_mode = resources.get("limitMode")
        policy = None
        authority_failure: object | None = None
        if limit_mode is not None:
            policy = _LIMIT_SCOPES.get(limit_mode)
            authority = _mapping(resources.get("limitAuthority"))
            intended = _mapping(resources.get("intendedAggregateLimits"))
            if policy is None or authority is None or intended is None:
                authority_failure = {
                    "limitMode": limit_mode,
                    "aggregateLimitIntentEnforced": resources.get(
                        "aggregateLimitIntentEnforced"
                    ),
                }
            else:
                expected_scopes = policy["scopes"]
                invalid_authority = sorted(
                    name
                    for name, scope in expected_scopes.items()
                    if _mapping(authority.get(name))
                    != {"enforced": True, "scope": scope}
                )
                intended_values = [
                    intended.get("cpuCount"),
                    intended.get("maxProcesses"),
                    intended.get("memoryBytes"),
                ]
                if (
                    resources.get("aggregateLimitIntentEnforced")
                    is not policy["aggregate"]
                    or invalid_authority
                    or any(
                        not _is_number(value) or float(value) <= 0
                        for value in intended_values
                    )
                ):
                    authority_failure = {
                        "limitMode": limit_mode,
                        "aggregateLimitIntentEnforced": resources.get(
                            "aggregateLimitIntentEnforced"
                        ),
                        "invalidAuthority": invalid_authority,
                    }
        if failed_limits or authority_failure is not None:
            _append_once(
                failures,
                _failure(
                    "resource_limits_enforced",
                    {
                        "failed": failed_limits,
                        "authority": authority_failure,
                    },
                    {
                        "enforced": sorted(required_limits),
                        "authority": "known exact limit mode and scope",
                    },
                    "At least one required scoped resource control was absent or mislabelled.",
                ),
            )
        else:
            verified.append(
                "resource_limits_enforced"
                if policy is not None and policy["aggregate"] is True
                else "scoped_resource_limits_enforced"
            )
            if limit_mode is None:
                limitations.append(
                    "Legacy runner evidence does not identify aggregate versus scoped limit authority."
                )
            elif limit_mode in {
                "process-rlimit-with-unenforced-cgroup-intent",
                "process-address-space-rlimit-with-unenforced-cgroup-intent",
            }:
                limitations.append(
                    "Aggregate cgroup intent was not enforced; memory and process controls are explicitly scoped to process or real-user rlimits."
                )

    isolation = _mapping(candidate.get("isolation"))
    if isolation is None:
        limitations.append("Hidden verifier and held-out mount-isolation evidence was not attached.")
    else:
        safe = (
            isolation.get("hiddenVerifierMounted") is False
            and isolation.get("heldOutMounted") is False
            and isolation.get("readAttemptsDenied") is True
        )
        if not safe:
            _append_once(
                failures,
                _failure(
                    "hidden_artifact_isolation",
                    {
                        "hiddenVerifierMounted": isolation.get("hiddenVerifierMounted"),
                        "heldOutMounted": isolation.get("heldOutMounted"),
                        "readAttemptsDenied": isolation.get("readAttemptsDenied"),
                    },
                    "hidden and held-out artifacts absent; read probes denied",
                    "A protected verifier or held-out artifact was visible to the candidate.",
                ),
            )
        else:
            verified.append("hidden_artifact_isolation")

    support = _mapping(candidate.get("support"))
    if support is None:
        limitations.append("Artifact support/refusal evidence was not attached.")
    else:
        supported = (
            support.get("status") == "SUPPORTED"
            and support.get("ambiguous") is False
        )
        if not supported:
            _append_once(
                failures,
                _failure(
                    "supported_case_only",
                    {
                        "status": support.get("status"),
                        "ambiguous": support.get("ambiguous"),
                    },
                    {"status": "SUPPORTED", "ambiguous": False},
                    "An unsupported or ambiguous artifact was submitted for verification.",
                ),
            )
        else:
            verified.append("supported_case_only")


def verify_candidate(candidate: object) -> dict[str, object]:
    """Verify a canonical leakage result and return structured counterexamples."""

    contract_failure = _validate_core_contract(candidate)
    if contract_failure is not None:
        return {
            "status": "REJECTED",
            "failures": [contract_failure],
            "verifiedInvariants": [],
            "limitations": [],
        }
    assert isinstance(candidate, Mapping)

    failures: list[dict[str, object]] = []
    verified: list[str] = []
    limitations: list[str] = []
    runs = _run_index(candidate)
    if runs is None:
        failures.append(
            _failure(
                "result_contract",
                "duplicate, missing, or malformed run identifiers",
                "unique string run identifiers",
                "The run list cannot be indexed by a unique run ID.",
            )
        )
        return {
            "status": "REJECTED",
            "failures": failures,
            "verifiedInvariants": verified,
            "limitations": limitations,
        }

    missing_runs = sorted(set(REQUIRED_RUN_IDS).difference(runs))
    extra_runs = sorted(set(runs).difference(REQUIRED_RUN_IDS))
    if missing_runs or extra_runs:
        failures.append(
            _failure(
                "required_runs",
                {"missing": missing_runs, "extra": extra_runs},
                list(REQUIRED_RUN_IDS),
                "The result must contain exactly the three leakage experiment runs.",
            )
        )
        return {
            "status": "REJECTED",
            "failures": failures,
            "verifiedInvariants": verified,
            "limitations": limitations,
        }
    verified.append("required_runs")

    for run_id in REQUIRED_RUN_IDS:
        failure = _validate_run_contract(run_id, runs[run_id])
        if failure is not None:
            _append_once(failures, failure)
    if failures:
        return {
            "status": "REJECTED",
            "failures": failures,
            "verifiedInvariants": verified,
            "limitations": limitations,
        }
    verified.append("result_contract")

    random_run = runs["random_row_split"]
    group_run = runs["customer_group_split"]
    ablation_run = runs["identity_ablation"]
    random_metrics = _mapping(random_run["metrics"])
    group_metrics = _mapping(group_run["metrics"])
    ablation_metrics = _mapping(ablation_run["metrics"])
    random_overlap = _mapping(random_run["entityOverlap"])
    group_overlap = _mapping(group_run["entityOverlap"])
    random_sizes = _mapping(random_run["sampleSizes"])
    fixture = _mapping(candidate["fixture"])
    assert (
        random_metrics is not None
        and group_metrics is not None
        and ablation_metrics is not None
        and random_overlap is not None
        and group_overlap is not None
        and random_sizes is not None
        and fixture is not None
    )

    for run_id, run in runs.items():
        metrics = _mapping(run["metrics"])
        overlap = _mapping(run["entityOverlap"])
        sizes = _mapping(run["sampleSizes"])
        entity_counts = _mapping(run["entityCounts"])
        assert (
            metrics is not None
            and overlap is not None
            and sizes is not None
            and entity_counts is not None
        )
        if not all(0.0 <= float(metrics[name]) <= 1.0 for name in ("accuracy", "rocAuc")):
            _append_once(
                failures,
                _failure(
                    "metric_ranges",
                    {"runId": run_id, "metrics": dict(metrics)},
                    "accuracy and ROC AUC within [0, 1]",
                    f"Run {run_id} reported an impossible metric value.",
                ),
            )
        if (
            int(overlap["count"]) < 0
            or not 0.0 <= float(overlap["rate"]) <= 1.0
            or int(sizes["train"]) <= 0
            or int(sizes["test"]) <= 0
            or int(entity_counts["train"]) <= 0
            or int(entity_counts["test"]) <= 0
            or int(overlap["count"]) > int(entity_counts["test"])
            or not math.isclose(
                float(overlap["rate"]),
                int(overlap["count"]) / int(entity_counts["test"]),
                abs_tol=1e-12,
            )
        ):
            _append_once(
                failures,
                _failure(
                    "sample_and_overlap_ranges",
                    {"runId": run_id},
                    "positive sample sizes and bounded nonnegative overlap",
                    f"Run {run_id} contains impossible sample or overlap values.",
                ),
            )
    if not any(item["invariant"] == "metric_ranges" for item in failures):
        verified.append("metric_ranges")

    if int(group_overlap["count"]) != 0 or float(group_overlap["rate"]) != 0.0:
        _append_once(
            failures,
            _failure(
                "zero_group_overlap",
                {"count": group_overlap["count"], "rate": group_overlap["rate"]},
                {"count": 0, "rate": 0.0},
                "Customer-group evaluation shared customer identities across train and test.",
            ),
        )
    else:
        verified.append("zero_group_overlap")

    if int(random_overlap["count"]) <= 0 or float(random_overlap["rate"]) <= 0.0:
        _append_once(
            failures,
            _failure(
                "baseline_overlap_exists",
                {"count": random_overlap["count"], "rate": random_overlap["rate"]},
                "positive overlap in the random row split",
                "The baseline no longer demonstrates the entity-overlap failure mode.",
            ),
        )
    else:
        verified.append("baseline_overlap_exists")

    bounded_outcomes = all(
        0.0 <= float(metrics[name]) <= 1.0
        for metrics in (random_metrics, group_metrics, ablation_metrics)
        for name in ("accuracy", "rocAuc")
    )
    if not bounded_outcomes:
        _append_once(
            failures,
            _failure(
                "bounded_kernel_outcomes",
                "metric outside [0, 1]",
                "finite bounded fixed-kernel outcomes",
                "A fixed-kernel outcome is outside its declared metric range.",
            ),
        )
    else:
        verified.append("bounded_kernel_outcomes")

    ablation_drops = set(ablation_run["dropFeatures"])
    random_drops = set(random_run["dropFeatures"])
    identity_removed = (
        "customer_id" in ablation_drops
        and "customer_id" not in random_drops
        and ablation_run["featureSetFingerprint"]
        != random_run["featureSetFingerprint"]
    )
    if not identity_removed:
        _append_once(
            failures,
            _failure(
                "identity_feature_removed",
                {
                    "dropFeatures": sorted(str(item) for item in ablation_drops),
                    "fingerprintChanged": ablation_run["featureSetFingerprint"]
                    != random_run["featureSetFingerprint"],
                },
                "customer_id removed and feature fingerprint changed",
                "The identity-ablation run retained identity-derived features.",
            ),
        )
    else:
        verified.append("identity_feature_removed")

    fixture_rows = fixture.get("rows")
    fixture_hash = fixture.get("sha256")
    expected_sizes = dict(random_sizes)
    pipeline_fingerprints = [
        run.get("pipelineFingerprint") for run in runs.values()
    ]
    pipelines_controlled = (
        all(value is None for value in pipeline_fingerprints)
        or (
            all(_is_sha256(value) for value in pipeline_fingerprints)
            and len(set(pipeline_fingerprints)) == 1
        )
    )
    controlled = (
        random_run["splitStrategy"] == "random"
        and group_run["splitStrategy"] == "group"
        and ablation_run["splitStrategy"] == "random"
        and random_run["seed"] == group_run["seed"] == ablation_run["seed"]
        == candidate["seed"]
        and random_run["dropFeatures"] == group_run["dropFeatures"]
        and random_run["model"] == group_run["model"] == ablation_run["model"]
        and random_run["groupBy"] is None
        and group_run["groupBy"] == "customer_id"
        and ablation_run["groupBy"] is None
        and random_run["featureSetFingerprint"]
        == group_run["featureSetFingerprint"]
        and pipelines_controlled
        and all(run["inputFingerprint"] == fixture_hash for run in runs.values())
        and all(run["sampleSizes"] == expected_sizes for run in runs.values())
        and (
            not _is_number(fixture_rows)
            or int(expected_sizes["train"]) + int(expected_sizes["test"])
            == int(fixture_rows)
        )
    )
    if not controlled:
        _append_once(
            failures,
            _failure(
                "declared_variable_control",
                {
                    "strategies": {
                        run_id: run["splitStrategy"] for run_id, run in runs.items()
                    },
                    "seeds": {run_id: run["seed"] for run_id, run in runs.items()},
                    "sampleSizesMatch": all(
                        run["sampleSizes"] == expected_sizes for run in runs.values()
                    ),
                    "inputFingerprintsMatch": all(
                        run["inputFingerprint"] == fixture_hash
                        for run in runs.values()
                    ),
                    "pipelineFingerprintsMatch": pipelines_controlled,
                },
                "same seed and samples; only declared split/feature variables change",
                "Baseline and intervention runs differ in an undeclared control variable.",
            ),
        )
    else:
        verified.append("declared_variable_control")

    chart_rows = _sequence(candidate["chartData"])
    chart_by_id: dict[str, Mapping[str, Any]] = {}
    if chart_rows is not None:
        for item in chart_rows:
            mapping = _mapping(item)
            if mapping is not None and isinstance(mapping.get("runId"), str):
                chart_by_id[mapping["runId"]] = mapping
    chart_matches = set(chart_by_id) == set(REQUIRED_RUN_IDS)
    if chart_matches:
        for run_id, run in runs.items():
            row = chart_by_id[run_id]
            metrics = _mapping(run["metrics"])
            sizes = _mapping(run["sampleSizes"])
            assert metrics is not None and sizes is not None
            if not (
                _is_number(row.get("accuracy"))
                and _is_number(row.get("rocAuc"))
                and _is_number(row.get("sampleSize"))
                and math.isclose(
                    float(row["accuracy"]), float(metrics["accuracy"]), abs_tol=1e-12
                )
                and math.isclose(
                    float(row["rocAuc"]), float(metrics["rocAuc"]), abs_tol=1e-12
                )
                and int(row["sampleSize"]) == int(sizes["test"])
                and row.get("splitStrategy") == run["splitStrategy"]
                and row.get("seed") == run["seed"]
            ):
                chart_matches = False
                break
    if not chart_matches:
        _append_once(
            failures,
            _failure(
                "chart_payload_matches",
                {"runIds": sorted(chart_by_id)},
                "one chart row per run with identical metrics and test sample size",
                "The chart series, labels, or sample size diverges from kernel truth.",
            ),
        )
    else:
        verified.append("chart_payload_matches")

    try:
        expected_hash = _result_hash(candidate)
    except (TypeError, ValueError, OverflowError):
        expected_hash = "invalid-canonical-payload"
    if not _is_sha256(candidate["resultHash"]) or candidate["resultHash"] != expected_hash:
        _append_once(
            failures,
            _failure(
                "reproducible_result",
                {"resultHash": candidate["resultHash"]},
                {"canonicalHash": expected_hash},
                "The recorded result hash does not match canonical result content.",
            ),
        )
    else:
        verified.append("canonical_result_hash")

    _verify_optional_evidence(candidate, failures, verified, limitations)
    return {
        "status": "REJECTED" if failures else "VERIFIED",
        "failures": failures,
        "verifiedInvariants": sorted(set(verified)),
        "limitations": limitations,
        "resultHash": candidate["resultHash"],
    }


def _with_complete_probe_evidence(candidate: Mapping[str, Any]) -> dict[str, Any]:
    enriched = copy.deepcopy(dict(candidate))
    enriched["probes"] = {
        "labelMutation": {"metricsChanged": True, "maxDelta": 0.25},
        "rowReordering": {"canonicalHashMatches": True},
        "reproducibility": {"sameSeedHashMatches": True},
    }
    enriched["plan"] = {
        "competingHypotheses": [
            "The random row result generalizes to unseen customers.",
            "Customer identity overlap creates a non-transferable shortcut.",
        ],
        "expectedDiscrimination": [
            {"runId": "random_row_split", "outcomesDiffer": True},
            {"runId": "customer_group_split", "outcomesDiffer": True},
            {"runId": "identity_ablation", "outcomesDiffer": True},
        ],
    }
    enriched["resourceEnforcement"] = {
        "networkDenied": True,
        "limits": {
            "wallSeconds": True,
            "memoryMb": True,
            "maxProcesses": True,
            "maxFiles": True,
            "maxOutputBytes": True,
        },
        "limitMode": "container-cgroup-and-process-rlimit",
        "aggregateLimitIntentEnforced": True,
        "intendedAggregateLimits": {
            "cpuCount": 2.0,
            "maxProcesses": 16,
            "memoryBytes": 536870912,
        },
        "limitAuthority": {
            name: {"enforced": True, "scope": scope}
            for name, scope in _LIMIT_SCOPES[
                "container-cgroup-and-process-rlimit"
            ]["scopes"].items()
        },
    }
    enriched["isolation"] = {
        "hiddenVerifierMounted": False,
        "heldOutMounted": False,
        "readAttemptsDenied": True,
    }
    enriched["support"] = {"status": "SUPPORTED", "ambiguous": False}
    return enriched


def _rehash(candidate: dict[str, Any]) -> None:
    candidate["resultHash"] = _result_hash(candidate)


def critical_mutations(reference: Mapping[str, Any]) -> list[dict[str, object]]:
    """Return independent seeded bad candidates for every published P0 check."""

    if _validate_core_contract(reference) is not None or _run_index(reference) is None:
        raise ValueError("reference must satisfy the canonical leakage result contract")
    base = _with_complete_probe_evidence(reference)
    mutations: list[dict[str, object]] = []

    def add(
        mutation_id: str,
        invariant: str,
        mutate: Any,
        *,
        rehash: bool = False,
    ) -> None:
        candidate = copy.deepcopy(base)
        mutate(candidate)
        if rehash:
            _rehash(candidate)
        mutations.append(
            {
                "id": mutation_id,
                "expectedInvariant": invariant,
                "candidate": candidate,
            }
        )

    def run(candidate: dict[str, Any], run_id: str) -> dict[str, Any]:
        return next(item for item in candidate["runs"] if item["id"] == run_id)

    add(
        "group-overlap-leak",
        "zero_group_overlap",
        lambda candidate: run(candidate, "customer_group_split")["entityOverlap"].update(
            {"count": 1, "rate": 1 / 120}
        ),
        rehash=True,
    )
    add(
        "stale-metrics-after-label-mutation",
        "metrics_are_computed",
        lambda candidate: candidate["probes"]["labelMutation"].update(
            {"metricsChanged": False, "maxDelta": 0.0}
        ),
    )
    add(
        "changed-intervention-seed",
        "declared_variable_control",
        lambda candidate: run(candidate, "customer_group_split").update({"seed": 99}),
        rehash=True,
    )
    add(
        "changed-pipeline-fingerprint",
        "declared_variable_control",
        lambda candidate: run(candidate, "customer_group_split").update(
            {"pipelineFingerprint": "0" * _HASH_LENGTH}
        ),
        rehash=True,
    )
    add(
        "identity-feature-retained",
        "identity_feature_removed",
        lambda candidate: run(candidate, "identity_ablation").update(
            {
                "dropFeatures": [],
                "featureSetFingerprint": run(candidate, "random_row_split")[
                    "featureSetFingerprint"
                ],
            }
        ),
        rehash=True,
    )
    add(
        "row-order-sensitive-result",
        "row_order_invariance",
        lambda candidate: candidate["probes"]["rowReordering"].update(
            {"canonicalHashMatches": False}
        ),
    )
    add(
        "forged-canonical-hash",
        "reproducible_result",
        lambda candidate: candidate.update({"resultHash": "0" * _HASH_LENGTH}),
    )
    add(
        "chart-series-stale",
        "chart_payload_matches",
        lambda candidate: candidate["chartData"][0].update({"accuracy": 0.0}),
        rehash=True,
    )
    add(
        "network-probe-escaped",
        "network_isolation",
        lambda candidate: candidate["resourceEnforcement"].update(
            {"networkDenied": False}
        ),
    )
    add(
        "wall-limit-not-enforced",
        "resource_limits_enforced",
        lambda candidate: candidate["resourceEnforcement"]["limits"].update(
            {"wallSeconds": False}
        ),
    )
    add(
        "aggregate-limit-authority-forged",
        "resource_limits_enforced",
        lambda candidate: candidate["resourceEnforcement"].update(
            {"aggregateLimitIntentEnforced": False}
        ),
    )
    add(
        "non-discriminating-plan",
        "discriminating_plan",
        lambda candidate: candidate["plan"].update(
            {
                "competingHypotheses": ["same prediction", "same prediction"],
                "expectedDiscrimination": [],
            }
        ),
    )
    add(
        "hidden-verifier-mounted",
        "hidden_artifact_isolation",
        lambda candidate: candidate["isolation"].update(
            {"hiddenVerifierMounted": True, "readAttemptsDenied": False}
        ),
    )
    add(
        "unsupported-artifact-accepted",
        "supported_case_only",
        lambda candidate: candidate["support"].update(
            {"status": "UNSUPPORTED", "ambiguous": True}
        ),
    )

    return mutations
