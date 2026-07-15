"""Validation and fixed interpretation for hosted Experiment Plan v2."""

from __future__ import annotations

import json
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any

import pandas as pd
from jsonschema import Draft202012Validator

from .canonical import sha256_json
from .experiment import run_leakage_plan
from .imbalance import REQUIRED_OPERATIONS, run_imbalance_plan


SCHEMA_PATH = (
    Path(__file__).resolve().parent / "schemas" / "experiment-plan-v2.schema.json"
)


class ExperimentPlanValidationError(ValueError):
    """Raised before execution when a hosted plan violates its fixed contract."""


def _schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _resolve_evidence(
    evidence: Mapping[str, Any],
    manifest: Mapping[str, Any],
    learner_claim: str,
) -> None:
    kind = evidence["kind"]
    digest = evidence["hash"]
    if kind == "schema":
        if digest != sha256_json(manifest["schemaSummary"]):
            raise ExperimentPlanValidationError("plan evidence schema hash is unknown")
        return
    if kind == "learner_claim":
        if digest != sha256_json(learner_claim):
            raise ExperimentPlanValidationError("plan evidence learner claim hash is unknown")
        return
    cell_index = evidence.get("cellIndex")
    cells = {
        int(cell["index"]): cell
        for cell in manifest.get("cells", [])
        if isinstance(cell, Mapping) and isinstance(cell.get("index"), int)
    }
    cell = cells.get(cell_index)
    if cell is None:
        raise ExperimentPlanValidationError("plan evidence cell index is unknown")
    if kind == "code":
        if digest != cell.get("sourceSha256"):
            raise ExperimentPlanValidationError("plan evidence source hash is unknown")
        return
    output_index = evidence.get("outputIndex")
    output_hashes = cell.get("outputHashes", [])
    if (
        not isinstance(output_index, int)
        or output_index < 0
        or output_index >= len(output_hashes)
        or output_hashes[output_index] != digest
    ):
        raise ExperimentPlanValidationError("plan evidence output hash is unknown")
    if kind == "metric" and not any(
        candidate.get("outputIndex") == output_index
        for candidate in cell.get("metricCandidates", [])
        if isinstance(candidate, Mapping)
    ):
        raise ExperimentPlanValidationError(
            "plan evidence output is not a metric candidate"
        )


def validate_experiment_plan(
    plan: Mapping[str, Any],
    manifest: Mapping[str, Any],
    *,
    learner_claim: str,
) -> dict[str, Any]:
    """Validate JSON Schema, lineage, evidence, and concept semantics."""

    candidate = deepcopy(dict(plan))
    errors = sorted(
        Draft202012Validator(_schema()).iter_errors(candidate),
        key=lambda error: list(error.absolute_path),
    )
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.absolute_path) or "plan"
        raise ExperimentPlanValidationError(
            f"experiment plan schema rejected {location}: {first.message}"
        )
    if candidate["artifactManifestHash"] != sha256_json(manifest):
        raise ExperimentPlanValidationError(
            "experiment plan artifact manifest hash does not match"
        )
    runs = [candidate["baseline"], *candidate["interventions"]]
    if len(runs) > candidate["resourceLimits"]["maxRuns"]:
        raise ExperimentPlanValidationError("experiment plan exceeds maxRuns")
    run_ids: set[str] = set()
    entity_candidates = set(manifest["schemaSummary"]["entityCandidates"])
    for run in runs:
        if run["concept"] != candidate["concept"]:
            raise ExperimentPlanValidationError(
                "experiment plan run concept does not match selected concept"
            )
        if run["runId"] in run_ids:
            raise ExperimentPlanValidationError("experiment plan run IDs must be unique")
        run_ids.add(run["runId"])
        if candidate["concept"] == "entity_leakage" and (
            run["entityField"] not in entity_candidates
        ):
            raise ExperimentPlanValidationError(
                "experiment plan entity field is not an artifact candidate"
            )
    if candidate["concept"] == "class_imbalance":
        target_candidates = set(manifest["schemaSummary"]["targetCandidates"])
        if not target_candidates:
            raise ExperimentPlanValidationError(
                "class imbalance plan requires an artifact target candidate"
            )
        by_operation = {run["operation"]: run for run in runs}
        if len(by_operation) != len(runs) or set(by_operation) != set(
            REQUIRED_OPERATIONS
        ):
            raise ExperimentPlanValidationError(
                "class imbalance plan requires all fixed operations exactly once"
            )
        majority = by_operation["imbalance.majority_baseline"]
        stratified = by_operation["imbalance.stratified_holdout"]
        threshold = by_operation["imbalance.threshold_sweep"]
        prevalence = by_operation["imbalance.prevalence_sweep"]
        if (
            majority["model"] != "majority_baseline"
            or majority["threshold"] != 0.5
            or majority["prevalenceScenario"] != "observed"
        ):
            raise ExperimentPlanValidationError(
                "majority baseline operation must use its fixed observed contract"
            )
        if (
            stratified["model"] != "logistic_regression"
            or stratified["threshold"] != 0.5
            or stratified["prevalenceScenario"] != "observed"
        ):
            raise ExperimentPlanValidationError(
                "stratified holdout operation must use its fixed observed contract"
            )
        if (
            threshold["model"] != "logistic_regression"
            or threshold["prevalenceScenario"] != "observed"
            or threshold["threshold"] == stratified["threshold"]
        ):
            raise ExperimentPlanValidationError(
                "threshold sweep operation must change only the decision threshold"
            )
        if (
            prevalence["model"] != "logistic_regression"
            or prevalence["prevalenceScenario"] == "observed"
            or prevalence["threshold"] != threshold["threshold"]
        ):
            raise ExperimentPlanValidationError(
                "prevalence sweep operation must change only deployment prevalence"
            )
        if len({run["seed"] for run in runs}) != 1:
            raise ExperimentPlanValidationError(
                "class imbalance operations must use the same seed"
            )
    patterns = candidate["expectedPatterns"]
    if {pattern["hypothesisId"] for pattern in patterns} != {
        "current",
        "competing",
    }:
        raise ExperimentPlanValidationError(
            "expected patterns must cover both hypotheses"
        )
    if patterns[0]["qualitativeOutcome"].casefold() == patterns[1][
        "qualitativeOutcome"
    ].casefold():
        raise ExperimentPlanValidationError(
            "expected patterns must be observably different"
        )
    for evidence in candidate["evidenceRefs"]:
        _resolve_evidence(evidence, manifest, learner_claim)
    return candidate


def interpret_experiment_plan(
    plan: Mapping[str, Any],
    manifest: Mapping[str, Any],
    fixture: pd.DataFrame,
    *,
    learner_claim: str,
) -> dict[str, Any]:
    """Execute a validated plan through concept-owned fixed functions."""

    validated = validate_experiment_plan(
        plan,
        manifest,
        learner_claim=learner_claim,
    )
    runs = [validated["baseline"], *validated["interventions"]]
    if validated["concept"] == "class_imbalance":
        return run_imbalance_plan(
            fixture,
            runs,
            plan_id=validated["planId"],
            session_id=validated["sessionId"],
            artifact_manifest_hash=validated["artifactManifestHash"],
            concept_pack_version=validated["conceptPackVersion"],
        )
    if validated["concept"] != "entity_leakage":
        raise ExperimentPlanValidationError(
            f"no fixed interpreter is registered for {validated['concept']}"
        )
    return run_leakage_plan(
        fixture,
        runs,
        plan_id=validated["planId"],
        session_id=validated["sessionId"],
        artifact_manifest_hash=validated["artifactManifestHash"],
        concept_pack_version=validated["conceptPackVersion"],
    )
