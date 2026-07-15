"""Frozen invariants and mutation catalogue for the class-imbalance lab."""

from __future__ import annotations

import copy
import math
from collections.abc import Mapping, Sequence
from typing import Any

from .canonical import sha256_json, sha256_json_browser
from .imbalance import REQUIRED_OPERATIONS


_METRICS = ("accuracy", "precision", "recall", "f1", "prAuc", "rocAuc")
_LEGACY_RUN_KEYS = frozenset(
    {
        "id",
        "operation",
        "model",
        "seed",
        "threshold",
        "prevalenceScenario",
        "metrics",
        "confusionMatrix",
        "sampleSizes",
        "classCounts",
        "prevalence",
        "predictedPositiveRate",
        "featureSetFingerprint",
        "inputFingerprint",
    }
)
_RUN_KEYS = _LEGACY_RUN_KEYS.union(
    {"pipelineFingerprint", "evaluationSetFingerprint", "scoreFingerprint"}
)
_TOLERANCE = 2e-10


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


def _is_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_hash(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True


def _mapping(value: object) -> Mapping[str, Any] | None:
    return value if isinstance(value, Mapping) else None


def _sequence(value: object) -> Sequence[Any] | None:
    if isinstance(value, Sequence) and not isinstance(
        value, (str, bytes, bytearray)
    ):
        return value
    return None


def _close(first: object, second: object) -> bool:
    return _is_number(first) and _is_number(second) and math.isclose(
        float(first), float(second), abs_tol=_TOLERANCE, rel_tol=0.0
    )


def _run_index(
    candidate: Mapping[str, Any],
) -> dict[str, Mapping[str, Any]] | None:
    runs = _sequence(candidate.get("runs"))
    if runs is None:
        return None
    indexed: dict[str, Mapping[str, Any]] = {}
    for value in runs:
        run = _mapping(value)
        if run is None or not isinstance(run.get("operation"), str):
            return None
        operation = str(run["operation"])
        if operation in indexed:
            return None
        indexed[operation] = run
    return indexed


def _append(
    failures: list[dict[str, object]], failure: dict[str, object]
) -> None:
    if not any(item["invariant"] == failure["invariant"] for item in failures):
        failures.append(failure)


def _contract_failure(candidate: object) -> dict[str, object] | None:
    if not isinstance(candidate, Mapping):
        return _failure(
            "result_contract",
            {"type": type(candidate).__name__},
            "canonical class-imbalance result object",
            "The verifier received a non-object candidate.",
        )
    required = {
        "schemaVersion",
        "concept",
        "kernelVersion",
        "seed",
        "fixture",
        "runs",
        "chartData",
        "resultHash",
    }
    missing = sorted(required.difference(candidate))
    if (
        missing
        or candidate.get("schemaVersion") not in {"1", "2"}
        or candidate.get("concept") != "class_imbalance"
        or not isinstance(candidate.get("kernelVersion"), str)
        or not _is_int(candidate.get("seed"))
        or _mapping(candidate.get("fixture")) is None
        or _sequence(candidate.get("runs")) is None
        or _sequence(candidate.get("chartData")) is None
        or not isinstance(candidate.get("resultHash"), str)
    ):
        return _failure(
            "result_contract",
            {
                "missing": missing,
                "schemaVersion": candidate.get("schemaVersion"),
                "concept": candidate.get("concept"),
            },
            "CounterLab class-imbalance result schema 1 or 2",
            "The result envelope is incomplete or malformed.",
        )
    fixture = _mapping(candidate["fixture"])
    if fixture is None or not {
        "sha256",
        "rows",
        "positives",
        "prevalence",
    }.issubset(fixture):
        return _failure(
            "result_contract",
            {"fixture": candidate.get("fixture")},
            "fixture hash, row count, positive count, and prevalence",
            "Fixture provenance is incomplete.",
        )
    if (
        not _is_hash(fixture.get("sha256"))
        or not _is_int(fixture.get("rows"))
        or not _is_int(fixture.get("positives"))
        or not _is_number(fixture.get("prevalence"))
    ):
        return _failure(
            "result_contract",
            {"fixture": candidate.get("fixture")},
            "typed finite fixture provenance",
            "Fixture provenance contains invalid values.",
        )
    if candidate["schemaVersion"] == "2" and (
        not all(
            isinstance(candidate.get(key), str) and bool(candidate[key])
            for key in ("planId", "sessionId", "conceptPackVersion")
        )
        or not _is_hash(candidate.get("artifactManifestHash"))
    ):
        return _failure(
            "result_contract",
            {"schemaVersion": "2", "lineage": "missing"},
            "plan, session, manifest, and concept-pack lineage",
            "A plan-interpreted result omitted lineage.",
        )
    return None


def _run_contract_failure(
    operation: str, run: Mapping[str, Any], *, schema_version: str
) -> dict[str, object] | None:
    approved_contracts = (
        {_RUN_KEYS}
        if schema_version == "2"
        else {_LEGACY_RUN_KEYS, _RUN_KEYS}
    )
    if set(run) not in approved_contracts:
        return _failure(
            "result_contract",
            {
                "operation": operation,
                "missing": sorted(_RUN_KEYS.difference(run)),
                "extra": sorted(set(run).difference(_RUN_KEYS)),
            },
            "exact fixed run contract",
            "A run contains missing or unapproved fields.",
        )
    metrics = _mapping(run.get("metrics"))
    matrix = _mapping(run.get("confusionMatrix"))
    sizes = _mapping(run.get("sampleSizes"))
    classes = _mapping(run.get("classCounts"))
    train_classes = _mapping(classes.get("train")) if classes else None
    test_classes = _mapping(classes.get("test")) if classes else None
    if (
        metrics is None
        or set(metrics) != set(_METRICS)
        or matrix is None
        or set(matrix) != {"tn", "fp", "fn", "tp"}
        or sizes is None
        or set(sizes) != {"train", "test"}
        or classes is None
        or train_classes is None
        or test_classes is None
        or set(train_classes) != {"negative", "positive"}
        or set(test_classes) != {"negative", "positive"}
        or not isinstance(run.get("id"), str)
        or not isinstance(run.get("model"), str)
        or not _is_int(run.get("seed"))
        or not _is_number(run.get("threshold"))
        or not isinstance(run.get("prevalenceScenario"), str)
        or not all(_is_number(metrics.get(name)) for name in _METRICS)
        or not all(_is_int(matrix.get(name)) for name in ("tn", "fp", "fn", "tp"))
        or not all(_is_int(sizes.get(name)) for name in ("train", "test"))
        or not all(
            _is_int(values.get(name))
            for values in (train_classes, test_classes)
            for name in ("negative", "positive")
        )
        or not _is_number(run.get("prevalence"))
        or not _is_number(run.get("predictedPositiveRate"))
        or not _is_hash(run.get("featureSetFingerprint"))
        or not _is_hash(run.get("inputFingerprint"))
        or (
            set(run) == _RUN_KEYS
            and not all(
                _is_hash(run.get(name))
                for name in (
                    "pipelineFingerprint",
                    "evaluationSetFingerprint",
                    "scoreFingerprint",
                )
            )
        )
    ):
        return _failure(
            "result_contract",
            {"operation": operation, "types": "invalid"},
            "finite metrics, integer counts, and canonical fingerprints",
            "A run contains malformed values.",
        )
    return None


def _confusion_expected(run: Mapping[str, Any]) -> dict[str, float]:
    matrix = run["confusionMatrix"]
    tn, fp, fn, tp = (float(matrix[name]) for name in ("tn", "fp", "fn", "tp"))
    total = tn + fp + fn + tp
    precision = 0.0 if tp + fp == 0 else tp / (tp + fp)
    recall = 0.0 if tp + fn == 0 else tp / (tp + fn)
    f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
    return {
        "accuracy": (tn + tp) / total,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "prevalence": (tp + fn) / total,
        "predictedPositiveRate": (tp + fp) / total,
        "sampleSize": total,
    }


def _chart_row(run: Mapping[str, Any]) -> dict[str, object]:
    return {
        "runId": run["id"],
        "operation": run["operation"],
        **dict(run["metrics"]),
        "prevalence": run["prevalence"],
        "predictedPositiveRate": run["predictedPositiveRate"],
        "sampleSize": run["sampleSizes"]["test"],
        "threshold": run["threshold"],
        "prevalenceScenario": run["prevalenceScenario"],
        "seed": run["seed"],
    }


def verify_imbalance_candidate(candidate: object) -> dict[str, object]:
    """Verify named, falsifiable properties of one fixed imbalance result."""

    core_failure = _contract_failure(candidate)
    if core_failure is not None or not isinstance(candidate, Mapping):
        return {
            "schemaVersion": "1",
            "concept": "class_imbalance",
            "status": "REJECTED",
            "verifiedInvariants": [],
            "failures": [core_failure],
            "limitations": [],
        }
    failures: list[dict[str, object]] = []
    verified: list[str] = ["result_contract"]
    indexed = _run_index(candidate)
    if indexed is None or set(indexed) != set(REQUIRED_OPERATIONS):
        return {
            "schemaVersion": "1",
            "concept": "class_imbalance",
            "status": "REJECTED",
            "verifiedInvariants": verified,
            "failures": [
                _failure(
                    "required_operations",
                    sorted(indexed or {}),
                    list(REQUIRED_OPERATIONS),
                    "The result must include each fixed discriminating operation exactly once.",
                )
            ],
            "limitations": [],
        }
    verified.append("required_operations")
    schema_version = str(candidate["schemaVersion"])
    for operation, run in indexed.items():
        failure = _run_contract_failure(
            operation, run, schema_version=schema_version
        )
        if failure is not None:
            _append(failures, failure)
    if schema_version == "1" and len({frozenset(run) for run in indexed.values()}) > 1:
        _append(
            failures,
            _failure(
                "result_contract",
                "mixed legacy and fingerprinted run contracts",
                "one uniform v1 run contract",
                "A legacy result cannot selectively omit control fingerprints.",
            ),
        )
    if failures:
        return {
            "schemaVersion": "1",
            "concept": "class_imbalance",
            "status": "REJECTED",
            "verifiedInvariants": verified,
            "failures": failures,
            "limitations": [],
        }

    ranges_valid = all(
        0.0 <= float(run["metrics"][name]) <= 1.0
        for run in indexed.values()
        for name in _METRICS
    ) and all(
        0.0 <= float(run[field]) <= 1.0
        for run in indexed.values()
        for field in ("prevalence", "predictedPositiveRate")
    )
    if ranges_valid:
        verified.append("metric_ranges")
    else:
        _append(
            failures,
            _failure(
                "metric_ranges",
                "outside [0, 1]",
                "finite rates between zero and one",
                "A displayed class metric is outside its valid range.",
            ),
        )

    consistency_failures: list[str] = []
    for operation, run in indexed.items():
        expected = _confusion_expected(run)
        test_classes = run["classCounts"]["test"]
        train_classes = run["classCounts"]["train"]
        consistent = (
            all(_close(run["metrics"][name], expected[name]) for name in ("accuracy", "precision", "recall", "f1"))
            and _close(run["prevalence"], expected["prevalence"])
            and _close(run["predictedPositiveRate"], expected["predictedPositiveRate"])
            and int(run["sampleSizes"]["test"]) == int(expected["sampleSize"])
            and int(test_classes["negative"]) == int(run["confusionMatrix"]["tn"]) + int(run["confusionMatrix"]["fp"])
            and int(test_classes["positive"]) == int(run["confusionMatrix"]["fn"]) + int(run["confusionMatrix"]["tp"])
            and int(run["sampleSizes"]["train"]) == int(train_classes["negative"]) + int(train_classes["positive"])
        )
        if not consistent:
            consistency_failures.append(operation)
    if not consistency_failures:
        verified.append("confusion_metric_consistency")
    else:
        _append(
            failures,
            _failure(
                "confusion_metric_consistency",
                {"operations": consistency_failures},
                "metrics and class counts recomputed from each confusion matrix",
                "At least one headline metric disagrees with its underlying counts.",
            ),
        )

    majority = indexed["imbalance.majority_baseline"]
    model = indexed["imbalance.stratified_holdout"]
    threshold = indexed["imbalance.threshold_sweep"]
    prevalence = indexed["imbalance.prevalence_sweep"]
    majority_ok = (
        majority["model"] == "majority_baseline"
        and majority["threshold"] == 0.5
        and majority["prevalenceScenario"] == "observed"
        and majority["confusionMatrix"]["fp"] == 0
        and majority["confusionMatrix"]["tp"] == 0
        and majority["metrics"]["precision"] == 0.0
        and majority["metrics"]["recall"] == 0.0
        and majority["metrics"]["f1"] == 0.0
        and _close(majority["metrics"]["prAuc"], majority["prevalence"])
        and _close(majority["metrics"]["rocAuc"], 0.5)
        and _close(majority["metrics"]["accuracy"], 1.0 - float(majority["prevalence"]))
    )
    if majority_ok:
        verified.append("majority_baseline_behavior")
    else:
        _append(
            failures,
            _failure(
                "majority_baseline_behavior",
                {"metrics": majority["metrics"], "matrix": majority["confusionMatrix"]},
                "high accuracy paired with zero minority recall",
                "The majority baseline no longer demonstrates the accuracy trap.",
            ),
        )

    minority_ok = (
        float(model["metrics"]["prAuc"]) > float(model["prevalence"]) + 0.05
        and float(model["metrics"]["rocAuc"]) > 0.5
        and float(model["metrics"]["recall"]) > float(majority["metrics"]["recall"])
    )
    if minority_ok:
        verified.append("minority_signal")
    else:
        _append(
            failures,
            _failure(
                "minority_signal",
                model["metrics"],
                "PR-AUC above prevalence and non-zero minority recall",
                "The model result does not establish genuine minority-class signal.",
            ),
        )

    threshold_ok = (
        threshold["model"] == "logistic_regression"
        and threshold["prevalenceScenario"] == "observed"
        and float(threshold["threshold"]) < float(model["threshold"])
        and float(threshold["metrics"]["recall"]) > float(model["metrics"]["recall"])
        and float(threshold["predictedPositiveRate"]) > float(model["predictedPositiveRate"])
    )
    if threshold_ok:
        verified.append("threshold_tradeoff")
    else:
        _append(
            failures,
            _failure(
                "threshold_tradeoff",
                {
                    "baselineThreshold": model["threshold"],
                    "changedThreshold": threshold["threshold"],
                    "baselineRecall": model["metrics"]["recall"],
                    "changedRecall": threshold["metrics"]["recall"],
                },
                "a lower threshold increases recall and predicted positives",
                "The threshold intervention is not discriminating.",
            ),
        )

    scenario = prevalence["prevalenceScenario"]
    prevalence_ok = (
        prevalence["model"] == "logistic_regression"
        and prevalence["threshold"] == threshold["threshold"]
        and (
            (
                scenario == "rarer"
                and float(prevalence["prevalence"]) < float(threshold["prevalence"])
                and float(prevalence["metrics"]["precision"]) <= float(threshold["metrics"]["precision"])
            )
            or (
                scenario == "more_common"
                and float(prevalence["prevalence"]) > float(threshold["prevalence"])
                and float(prevalence["metrics"]["precision"]) >= float(threshold["metrics"]["precision"])
            )
        )
    )
    if prevalence_ok:
        verified.append("prevalence_sensitivity")
    else:
        _append(
            failures,
            _failure(
                "prevalence_sensitivity",
                {"scenario": scenario, "prevalence": prevalence["prevalence"], "precision": prevalence["metrics"]["precision"]},
                "precision changes in the documented direction as prevalence changes",
                "The prevalence intervention does not preserve its declared control.",
            ),
        )

    fixture = candidate["fixture"]
    shared_seeds = {run["seed"] for run in indexed.values()} == {candidate["seed"]}
    shared_inputs = {run["inputFingerprint"] for run in indexed.values()} == {fixture["sha256"]}
    shared_features = len({run["featureSetFingerprint"] for run in indexed.values()}) == 1
    fingerprint_contract_present = all(set(run) == _RUN_KEYS for run in indexed.values())
    fingerprint_controls = (
        not fingerprint_contract_present
        or (
            model["scoreFingerprint"] == threshold["scoreFingerprint"]
            and model["evaluationSetFingerprint"]
            == threshold["evaluationSetFingerprint"]
            == majority["evaluationSetFingerprint"]
            and prevalence["evaluationSetFingerprint"]
            != threshold["evaluationSetFingerprint"]
            and model["pipelineFingerprint"]
            == threshold["pipelineFingerprint"]
            == prevalence["pipelineFingerprint"]
        )
    )
    controls_ok = (
        shared_seeds
        and shared_inputs
        and shared_features
        and model["model"] == threshold["model"] == prevalence["model"] == "logistic_regression"
        and model["classCounts"] == threshold["classCounts"]
        and model["sampleSizes"] == threshold["sampleSizes"]
        and prevalence["classCounts"]["train"] == threshold["classCounts"]["train"]
        and fingerprint_controls
    )
    if controls_ok:
        verified.append("declared_variable_control")
    else:
        _append(
            failures,
            _failure(
                "declared_variable_control",
                {
                    "sharedSeeds": shared_seeds,
                    "sharedInputs": shared_inputs,
                    "sharedFeatures": shared_features,
                    "fingerprintControls": fingerprint_controls,
                },
                "only model, threshold, or evaluation prevalence changes as declared",
                "An undeclared variable changed across the comparison.",
            ),
        )

    train_prevalence = float(model["classCounts"]["train"]["positive"]) / float(model["sampleSizes"]["train"])
    stratified_ok = (
        model["prevalence"] == majority["prevalence"]
        and abs(train_prevalence - float(model["prevalence"])) <= 0.005
    )
    if stratified_ok:
        verified.append("stratified_holdout")
    else:
        _append(
            failures,
            _failure(
                "stratified_holdout",
                {"trainPrevalence": train_prevalence, "testPrevalence": model["prevalence"]},
                "train and test prevalence remain aligned",
                "The supposed stratified holdout changed the class distribution.",
            ),
        )

    expected_chart = [_chart_row(run) for run in candidate["runs"]]
    if candidate["chartData"] == expected_chart:
        verified.append("chart_payload_matches")
    else:
        _append(
            failures,
            _failure(
                "chart_payload_matches",
                "chart differs from run payload",
                "chart rows derived exactly from canonical runs",
                "The displayed series is stale or relabelled.",
            ),
        )

    canonical = {key: value for key, value in candidate.items() if key != "resultHash"}
    canonical_hash = (
        sha256_json_browser(canonical)
        if candidate["schemaVersion"] == "2"
        else sha256_json(canonical)
    )
    if candidate["resultHash"] == canonical_hash:
        verified.append("canonical_result_hash")
    else:
        _append(
            failures,
            _failure(
                "canonical_result_hash",
                candidate["resultHash"],
                canonical_hash,
                "The canonical result hash does not cover the supplied payload.",
            ),
        )

    return {
        "schemaVersion": "1",
        "concept": "class_imbalance",
        "status": "VERIFIED" if not failures else "REJECTED",
        "verifiedInvariants": sorted(set(verified)),
        "failures": failures,
        "limitations": [
            "These checks cover one deterministic rare-event fixture; they do not choose a production threshold or establish deployment performance."
        ],
    }


def _rehash(candidate: dict[str, Any]) -> None:
    canonical = {key: value for key, value in candidate.items() if key != "resultHash"}
    candidate["resultHash"] = (
        sha256_json_browser(canonical)
        if candidate.get("schemaVersion") == "2"
        else sha256_json(canonical)
    )


def critical_imbalance_mutations(
    reference: Mapping[str, Any],
) -> list[dict[str, object]]:
    """Return deterministic bad candidates targeting the published invariants."""

    if verify_imbalance_candidate(reference)["status"] != "VERIFIED":
        raise ValueError("reference must be a verified class-imbalance result")
    mutations: list[dict[str, object]] = []

    def add(mutation_id: str, invariant: str, mutate: Any, *, rehash: bool = True) -> None:
        candidate = copy.deepcopy(dict(reference))
        mutate(candidate)
        if rehash:
            _rehash(candidate)
        mutations.append(
            {"id": mutation_id, "expectedInvariant": invariant, "candidate": candidate}
        )

    def run(candidate: dict[str, Any], operation: str) -> dict[str, Any]:
        return next(item for item in candidate["runs"] if item["operation"] == operation)

    add(
        "missing-prevalence-run",
        "required_operations",
        lambda candidate: candidate["runs"].pop(),
    )
    add(
        "metric-outside-unit-range",
        "metric_ranges",
        lambda candidate: run(candidate, "imbalance.stratified_holdout")["metrics"].update({"prAuc": 1.2}),
    )
    add(
        "stale-confusion-matrix",
        "confusion_metric_consistency",
        lambda candidate: run(candidate, "imbalance.stratified_holdout")["confusionMatrix"].update({"tp": 5}),
    )
    add(
        "majority-claims-minority-recall",
        "majority_baseline_behavior",
        lambda candidate: run(candidate, "imbalance.majority_baseline")["metrics"].update({"recall": 0.5}),
    )
    add(
        "minority-signal-erased",
        "minority_signal",
        lambda candidate: run(candidate, "imbalance.stratified_holdout")["metrics"].update({"prAuc": run(candidate, "imbalance.stratified_holdout")["prevalence"], "rocAuc": 0.5}),
    )

    def erase_threshold(candidate: dict[str, Any]) -> None:
        changed = run(candidate, "imbalance.threshold_sweep")
        baseline = run(candidate, "imbalance.stratified_holdout")
        changed.update(
            {
                key: copy.deepcopy(baseline[key])
                for key in (
                    "threshold",
                    "metrics",
                    "confusionMatrix",
                    "sampleSizes",
                    "classCounts",
                    "prevalence",
                    "predictedPositiveRate",
                )
            }
        )

    add("threshold-does-not-change-outcome", "threshold_tradeoff", erase_threshold)

    def erase_prevalence(candidate: dict[str, Any]) -> None:
        changed = run(candidate, "imbalance.prevalence_sweep")
        baseline = run(candidate, "imbalance.threshold_sweep")
        changed.update(
            {
                key: copy.deepcopy(baseline[key])
                for key in (
                    "metrics",
                    "confusionMatrix",
                    "sampleSizes",
                    "classCounts",
                    "prevalence",
                    "predictedPositiveRate",
                )
            }
        )

    add("prevalence-does-not-change", "prevalence_sensitivity", erase_prevalence)
    add(
        "fixture-fingerprint-drift",
        "declared_variable_control",
        lambda candidate: run(candidate, "imbalance.prevalence_sweep").update({"inputFingerprint": "0" * 64}),
    )
    add(
        "threshold-score-fingerprint-drift",
        "declared_variable_control",
        lambda candidate: run(candidate, "imbalance.threshold_sweep").update(
            {"scoreFingerprint": "0" * 64}
        ),
    )
    add(
        "threshold-evaluation-fingerprint-drift",
        "declared_variable_control",
        lambda candidate: run(candidate, "imbalance.threshold_sweep").update(
            {"evaluationSetFingerprint": "0" * 64}
        ),
    )
    add(
        "prevalence-pipeline-fingerprint-drift",
        "declared_variable_control",
        lambda candidate: run(candidate, "imbalance.prevalence_sweep").update(
            {"pipelineFingerprint": "0" * 64}
        ),
    )
    add(
        "stale-chart-metric",
        "chart_payload_matches",
        lambda candidate: candidate["chartData"][1].update({"recall": 0.99}),
    )
    add(
        "forged-result-hash",
        "canonical_result_hash",
        lambda candidate: candidate.update({"resultHash": "0" * 64}),
        rehash=False,
    )
    add(
        "unstratified-train-counts",
        "stratified_holdout",
        lambda candidate: run(candidate, "imbalance.stratified_holdout")["classCounts"]["train"].update({"negative": 4500, "positive": 0}),
    )
    add(
        "changed-intervention-seed",
        "declared_variable_control",
        lambda candidate: run(candidate, "imbalance.threshold_sweep").update({"seed": 99}),
    )
    if reference.get("schemaVersion") == "2":
        add(
            "missing-artifact-manifest-lineage",
            "result_contract",
            lambda candidate: candidate.pop("artifactManifestHash"),
        )
        add(
            "malformed-artifact-manifest-lineage",
            "result_contract",
            lambda candidate: candidate.update(
                {"artifactManifestHash": "not-a-sha256"}
            ),
        )

        def strip_control_fingerprints(candidate: dict[str, Any]) -> None:
            for candidate_run in candidate["runs"]:
                candidate_run.pop("pipelineFingerprint")
                candidate_run.pop("evaluationSetFingerprint")
                candidate_run.pop("scoreFingerprint")

        add(
            "stripped-control-fingerprints",
            "result_contract",
            strip_control_fingerprints,
        )

        def mix_run_contract_versions(candidate: dict[str, Any]) -> None:
            candidate_run = candidate["runs"][0]
            candidate_run.pop("pipelineFingerprint")
            candidate_run.pop("evaluationSetFingerprint")
            candidate_run.pop("scoreFingerprint")

        add(
            "mixed-run-contract-versions",
            "result_contract",
            mix_run_contract_versions,
        )
    return mutations


__all__ = ["critical_imbalance_mutations", "verify_imbalance_candidate"]
