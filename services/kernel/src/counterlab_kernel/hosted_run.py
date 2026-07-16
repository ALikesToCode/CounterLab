"""Artifact-bound entrypoint for hosted fixed-kernel lab jobs."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .canonical import canonical_json, sha256_json, sha256_json_browser
from .fixture import generate_leakage_fixture
from .imbalance import generate_imbalance_fixture
from .plan import ExperimentPlanValidationError, interpret_experiment_plan


_MAX_BUNDLE_BYTES = 2 * 1024 * 1024
_EXPERIMENT_IR_SCHEMA_PATH = (
    Path(__file__).resolve().parent / "schemas" / "experiment-ir-v5.schema.json"
)
_V1_BUNDLE_KEYS = frozenset(
    {
        "schemaVersion",
        "kind",
        "purpose",
        "jobId",
        "sessionId",
        "stateVersion",
        "artifactManifestHash",
        "artifactManifest",
        "learnerClaim",
        "experimentPlan",
        "experimentPlanHash",
        "fixture",
        "permittedOutputs",
    }
)
_V5_BUNDLE_KEYS = frozenset(
    {
        "schemaVersion",
        "kind",
        "purpose",
        "jobId",
        "sessionId",
        "stateVersion",
        "artifactManifestHash",
        "approvedBeliefSpec",
        "beliefSpecHash",
        "prediction",
        "artifactManifest",
        "fixture",
        "selectedExperimentIr",
        "selectedExperimentIrHash",
        "fixedSelection",
        "projectedPlan",
        "expectedHashes",
        "provenance",
        "resultOutput",
        "permittedOutputs",
    }
)
_V5_INTERACTIVE_BUNDLE_KEYS = frozenset(
    {
        "schemaVersion",
        "kind",
        "purpose",
        "jobId",
        "sessionId",
        "stateVersion",
        "artifactManifestHash",
        "artifactManifest",
        "approvedBeliefSpec",
        "beliefSpecHash",
        "prediction",
        "fixture",
        "compileAuthority",
        "selectedExperimentIr",
        "fixedSelection",
        "basePlan",
        "releaseAuthority",
        "configuration",
        "configurationHash",
        "derivationVersion",
        "selectedRunId",
        "interactivePlan",
        "interactivePlanHash",
        "resultOutput",
        "permittedOutputs",
    }
)
_V5_COMPILE_AUTHORITY_KEYS = frozenset(
    {
        "schemaVersion",
        "status",
        "source",
        "jobId",
        "inputBundleHash",
        "artifactManifestHash",
        "beliefSpecHash",
        "predictionHash",
        "compilerOutputFileHashes",
        "discriminationContractHash",
        "rawExperimentIrCanonicalHash",
        "labSceneHash",
        "candidateVerificationReportHash",
        "scientificVerifierVersion",
        "selectionHash",
        "selectedExperimentIrHash",
        "projectedPlanHash",
        "scorerVersion",
        "projectionAdapterVersion",
    }
)
_V5_RELEASE_AUTHORITY_KEYS = frozenset(
    {
        "authoritativeResultHash",
        "evidenceVerdict",
        "evidenceVerdictHash",
        "epistemicReportHash",
    }
)
_V5_EVIDENCE_VERDICT_BASE_KEYS = frozenset(
    {
        "schemaVersion",
        "kind",
        "irHash",
        "technicalReportHash",
        "verifierVersion",
    }
)
_V5_LEAKAGE_CONFIGURATION_KEYS = frozenset(
    {
        "schemaVersion",
        "splitStrategy",
        "entityField",
        "identityAblation",
        "testFraction",
    }
)
_V5_IMBALANCE_CONFIGURATION_KEYS = frozenset(
    {
        "schemaVersion",
        "concept",
        "threshold",
        "prevalenceScenario",
        "metricFocus",
    }
)
_V5_EXPECTED_HASH_KEYS = frozenset(
    {
        "artifactManifest",
        "beliefSpec",
        "prediction",
        "fixtureDescriptor",
        "compileInputBundle",
        "rawExperimentIrFile",
        "rawExperimentIrCanonical",
        "candidateVerificationReport",
        "experimentSelection",
        "selectedExperimentIr",
        "projectedPlan",
    }
)
_COMPILER_OUTPUT_PATHS = frozenset(
    {
        "discrimination-contract.json",
        "experiment-ir.json",
        "lab-scene.json",
        "public-rationale.md",
    }
)
_REGISTERED_FIXTURES = {
    "entity_leakage": {
        "id": "public-leakage-v1",
        "version": "leakage-fixture-v1",
        "contentSha256": (
            "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70"
        ),
    },
    "class_imbalance": {
        "id": "public-imbalance-v1",
        "version": "imbalance-fixture-v1",
        "contentSha256": (
            "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f"
        ),
    },
}


class HostedLabRunError(ValueError):
    """Raised before fixed execution when hosted job lineage is invalid."""


def _mapping(value: object, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise HostedLabRunError(f"{name} must be an object")
    return value


def _exact_keys(value: Mapping[str, Any], expected: frozenset[str], name: str) -> None:
    extra = sorted(set(value).difference(expected))
    missing = sorted(expected.difference(value))
    if extra or missing:
        raise HostedLabRunError(
            f"{name} fields are invalid: missing={missing}, extra={extra}"
        )


def _is_sha256(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def _validate_experiment_ir(value: Mapping[str, Any]) -> None:
    schema = json.loads(_EXPERIMENT_IR_SCHEMA_PATH.read_text(encoding="utf-8"))
    errors = sorted(
        Draft202012Validator(schema).iter_errors(dict(value)),
        key=lambda error: list(error.absolute_path),
    )
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.absolute_path) or "IR"
        raise HostedLabRunError(
            f"selected Experiment IR schema rejected {location}: {first.message}"
        )


def _fixed_fixture(concept: str) -> Any:
    return (
        generate_leakage_fixture()
        if concept == "entity_leakage"
        else generate_imbalance_fixture()
    )


def _execute_plan(
    plan: Mapping[str, Any],
    manifest: Mapping[str, Any],
    learner_claim: str,
    fixture_descriptor: Mapping[str, Any],
) -> dict[str, Any]:
    try:
        result = interpret_experiment_plan(
            plan,
            manifest,
            _fixed_fixture(str(plan.get("concept"))),
            learner_claim=learner_claim,
        )
    except ExperimentPlanValidationError as error:
        raise HostedLabRunError(str(error)) from error
    result_fixture = _mapping(result.get("fixture"), "result fixture")
    if result_fixture.get("sha256") != fixture_descriptor.get("contentSha256"):
        raise HostedLabRunError("fixed fixture content hash does not match registry")
    return result


def _project_selected_ir(ir: Mapping[str, Any]) -> dict[str, Any]:
    selection = _mapping(ir.get("selection"), "selectedExperimentIr.selection")
    if selection.get("status") != "SELECTED":
        raise HostedLabRunError("selected Experiment IR is not fixed-selected")
    candidate_id = selection.get("candidateId")
    candidates = ir.get("candidateExperiments")
    if not isinstance(candidates, list):
        raise HostedLabRunError("selected Experiment IR candidates are invalid")
    selected = next(
        (
            candidate
            for candidate in candidates
            if isinstance(candidate, Mapping) and candidate.get("id") == candidate_id
        ),
        None,
    )
    if selected is None:
        raise HostedLabRunError("selected Experiment IR candidate does not resolve")
    hypotheses = ir.get("hypotheses")
    if (
        not isinstance(hypotheses, list)
        or len(hypotheses) != 2
        or not all(isinstance(hypothesis, Mapping) for hypothesis in hypotheses)
    ):
        raise HostedLabRunError("selected Experiment IR hypotheses are invalid")

    def strip_prefix(value: object, prefix: str) -> object:
        return (
            value[len(prefix) :]
            if isinstance(value, str) and value.startswith(prefix)
            else value
        )

    controlled = selected.get("heldConstantIds")
    changed = selected.get("changedVariableIds")
    if not isinstance(controlled, list) or not isinstance(changed, list):
        raise HostedLabRunError("selected Experiment IR controls are invalid")
    return {
        "schemaVersion": "2",
        "planId": ir.get("executionPlanId"),
        "sessionId": ir.get("sessionId"),
        "concept": ir.get("concept"),
        "conceptPackVersion": ir.get("conceptPackVersion"),
        "artifactManifestHash": ir.get("artifactManifestHash"),
        "beliefTestId": ir.get("beliefSpecId"),
        "evidenceRefs": ir.get("evidenceRefs"),
        "baseline": selected.get("baseline"),
        "interventions": selected.get("interventions"),
        "controlledVariables": [strip_prefix(value, "control.") for value in controlled],
        "changedVariables": [strip_prefix(value, "change.") for value in changed],
        "metrics": selected.get("observableIds"),
        "visualizations": ir.get("visualizations"),
        "discriminatesBecause": selected.get("discriminatesBecause"),
        "expectedPatterns": [
            {
                "hypothesisId": hypothesis.get("id"),
                "qualitativeOutcome": _mapping(
                    hypothesis.get("predictedPattern"), "hypothesis pattern"
                ).get("description"),
            }
            for hypothesis in hypotheses
        ],
        "nonClaims": ir.get("nonClaims"),
        "resourceLimits": ir.get("resourceLimits"),
    }


def _embedded_selection(ir: Mapping[str, Any]) -> dict[str, Any]:
    ir_selection = _mapping(ir.get("selection"), "IR selection")
    if ir_selection.get("status") != "SELECTED":
        raise HostedLabRunError("fixed Experiment Selection lineage does not match")
    return {
        "eligibleCandidateIds": ir_selection.get("eligibleCandidateIds"),
        "rejectedCandidates": ir_selection.get("rejectedCandidates"),
        "selectedCandidateId": ir_selection.get("candidateId"),
        "minimumSeparation": ir_selection.get("minimumSeparation"),
        "requiredSeparation": ir_selection.get("requiredSeparation"),
        "complexityCost": ir_selection.get("complexityCost"),
        "normalizedScore": ir_selection.get("normalizedScore"),
        "scorerVersion": ir_selection.get("scorerVersion"),
    }


def _derive_interactive_plan_v5(
    base_plan: Mapping[str, Any],
    configuration: Mapping[str, Any],
    configuration_hash: str,
) -> tuple[dict[str, Any], str]:
    selected_run_id = f"interactive-{configuration_hash[:16]}"
    plan_id = f"interactive-plan-{configuration_hash[:16]}"
    derived = deepcopy(dict(base_plan))
    derived["planId"] = plan_id

    if configuration.get("concept") == "class_imbalance":
        _exact_keys(
            configuration,
            _V5_IMBALANCE_CONFIGURATION_KEYS,
            "class-imbalance interactive configuration",
        )
        if base_plan.get("concept") != "class_imbalance":
            raise HostedLabRunError(
                "class-imbalance controls require a class-imbalance base Plan"
            )
        if (
            configuration.get("schemaVersion") != "1"
            or configuration.get("prevalenceScenario")
            not in {"observed", "rarer", "more_common"}
            or configuration.get("metricFocus")
            not in {"precision", "recall", "f1", "pr_auc"}
            or not isinstance(configuration.get("threshold"), (int, float))
            or not 0.05 <= float(configuration["threshold"]) <= 0.45
        ):
            raise HostedLabRunError(
                "class-imbalance interactive configuration is invalid"
            )
        target_operation = (
            "imbalance.threshold_sweep"
            if configuration.get("prevalenceScenario") == "observed"
            else "imbalance.prevalence_sweep"
        )
        selected = False
        interventions = derived.get("interventions")
        if not isinstance(interventions, list):
            raise HostedLabRunError("interactive Plan interventions are invalid")
        for run in interventions:
            if isinstance(run, dict) and run.get("operation") == target_operation:
                selected = True
                run.update(
                    {
                        "runId": selected_run_id,
                        "threshold": configuration["threshold"],
                        "prevalenceScenario": configuration["prevalenceScenario"],
                    }
                )
        if not selected:
            raise HostedLabRunError(
                "base Plan is missing the registered class-imbalance control"
            )
        return derived, selected_run_id

    _exact_keys(
        configuration,
        _V5_LEAKAGE_CONFIGURATION_KEYS,
        "leakage interactive configuration",
    )
    if base_plan.get("concept") != "entity_leakage":
        raise HostedLabRunError("leakage controls require an entity-leakage base Plan")
    if (
        configuration.get("schemaVersion") != "1"
        or configuration.get("splitStrategy") not in {"random", "group"}
        or not isinstance(configuration.get("entityField"), str)
        or not str(configuration.get("entityField")).strip()
        or not isinstance(configuration.get("identityAblation"), bool)
        or not isinstance(configuration.get("testFraction"), (int, float))
        or not 0.1 <= float(configuration["testFraction"]) <= 0.5
    ):
        raise HostedLabRunError("leakage interactive configuration is invalid")
    target_operation = (
        "leakage.group_holdout"
        if configuration.get("splitStrategy") == "group"
        else (
            "leakage.identity_ablation"
            if configuration.get("identityAblation")
            else "leakage.random_row_split"
        )
    )
    selected = False
    runs: list[object] = [derived.get("baseline")]
    interventions = derived.get("interventions")
    if not isinstance(interventions, list):
        raise HostedLabRunError("interactive Plan interventions are invalid")
    runs.extend(interventions)
    for run in runs:
        if isinstance(run, dict) and run.get("operation") == target_operation:
            selected = True
            run.update(
                {
                    "runId": selected_run_id,
                    "entityField": configuration["entityField"],
                    "dropIdentity": configuration["identityAblation"],
                    "testFraction": configuration["testFraction"],
                }
            )
    if not selected:
        raise HostedLabRunError(
            "base Plan is missing the registered leakage control"
        )
    return derived, selected_run_id


def _execute_v5_interactive(bundle: Mapping[str, Any]) -> dict[str, Any]:
    _exact_keys(
        bundle,
        _V5_INTERACTIVE_BUNDLE_KEYS,
        "hosted interactive LAB_RUN v5 bundle",
    )
    if bundle.get("purpose") != "INTERACTIVE":
        raise HostedLabRunError("hosted interactive LAB_RUN v5 purpose is invalid")
    if bundle.get("permittedOutputs") != ["verified-result.json"]:
        raise HostedLabRunError(
            "hosted interactive LAB_RUN v5 output policy is invalid"
        )
    if bundle.get("derivationVersion") != "interactive-plan-v5-derivation-v1":
        raise HostedLabRunError("interactive Plan derivation version is invalid")

    manifest = _mapping(bundle.get("artifactManifest"), "artifactManifest")
    belief = _mapping(bundle.get("approvedBeliefSpec"), "approvedBeliefSpec")
    prediction = _mapping(bundle.get("prediction"), "prediction")
    fixture = _mapping(bundle.get("fixture"), "fixture")
    compile_authority = _mapping(
        bundle.get("compileAuthority"), "compileAuthority"
    )
    selected_ir = _mapping(
        bundle.get("selectedExperimentIr"), "selectedExperimentIr"
    )
    selection = _mapping(bundle.get("fixedSelection"), "fixedSelection")
    base_plan = _mapping(bundle.get("basePlan"), "basePlan")
    release_authority = _mapping(
        bundle.get("releaseAuthority"), "releaseAuthority"
    )
    configuration = _mapping(bundle.get("configuration"), "configuration")
    interactive_plan = _mapping(bundle.get("interactivePlan"), "interactivePlan")
    result_output = _mapping(bundle.get("resultOutput"), "resultOutput")

    _exact_keys(
        compile_authority,
        _V5_COMPILE_AUTHORITY_KEYS,
        "compileAuthority",
    )
    _exact_keys(
        release_authority,
        _V5_RELEASE_AUTHORITY_KEYS,
        "releaseAuthority",
    )
    _exact_keys(
        result_output,
        frozenset({"path", "schemaVersion", "authorityHash"}),
        "resultOutput",
    )
    _validate_experiment_ir(selected_ir)

    concept = selected_ir.get("concept")
    if concept not in _REGISTERED_FIXTURES:
        raise HostedLabRunError("no interactive fixed runner is registered")
    if dict(fixture) != _REGISTERED_FIXTURES[str(concept)]:
        raise HostedLabRunError("fixture is not registered for the selected concept")
    if _embedded_selection(selected_ir) != selection:
        raise HostedLabRunError("fixed Experiment Selection lineage does not match")
    if _project_selected_ir(selected_ir) != base_plan:
        raise HostedLabRunError("base Plan does not match selected Experiment IR")

    compiler_hashes = _mapping(
        compile_authority.get("compilerOutputFileHashes"),
        "compilerOutputFileHashes",
    )
    _exact_keys(compiler_hashes, _COMPILER_OUTPUT_PATHS, "compilerOutputFileHashes")
    hash_fields = [
        "inputBundleHash",
        "artifactManifestHash",
        "beliefSpecHash",
        "predictionHash",
        "discriminationContractHash",
        "rawExperimentIrCanonicalHash",
        "labSceneHash",
        "candidateVerificationReportHash",
        "selectionHash",
        "selectedExperimentIrHash",
        "projectedPlanHash",
    ]
    if not all(_is_sha256(compile_authority.get(field)) for field in hash_fields):
        raise HostedLabRunError("compile authority contains an invalid digest")
    if not all(_is_sha256(value) for value in compiler_hashes.values()):
        raise HostedLabRunError("compiler output authority contains an invalid digest")
    if (
        compile_authority.get("schemaVersion") != "5"
        or compile_authority.get("status") != "VERIFIED"
        or compile_authority.get("source") != "hosted-experiment-ir-v5"
        or compile_authority.get("scientificVerifierVersion")
        != "scientific-candidate-verifier-v1"
        or compile_authority.get("projectionAdapterVersion")
        != "experiment-ir-v5-to-plan-v2-v1"
        or compile_authority.get("scorerVersion") != selection.get("scorerVersion")
    ):
        raise HostedLabRunError("compile authority version lineage is invalid")

    manifest_hash = sha256_json_browser(manifest)
    belief_hash = sha256_json_browser(belief)
    prediction_base = {
        key: value for key, value in prediction.items() if key != "immutableHash"
    }
    prediction_hash = sha256_json_browser(prediction_base)
    if (
        bundle.get("artifactManifestHash") != manifest_hash
        or compile_authority.get("artifactManifestHash") != manifest_hash
        or bundle.get("beliefSpecHash") != belief_hash
        or compile_authority.get("beliefSpecHash") != belief_hash
        or prediction.get("immutableHash") != prediction_hash
        or compile_authority.get("predictionHash") != prediction_hash
        or compile_authority.get("selectedExperimentIrHash")
        != sha256_json_browser(selected_ir)
        or compile_authority.get("selectionHash")
        != sha256_json_browser(selection)
        or compile_authority.get("projectedPlanHash")
        != sha256_json_browser(base_plan)
    ):
        raise HostedLabRunError("interactive compile authority hash lineage is invalid")

    verdict = _mapping(
        release_authority.get("evidenceVerdict"), "evidenceVerdict"
    )
    verdict_kind = verdict.get("kind")
    verdict_keys = (
        _V5_EVIDENCE_VERDICT_BASE_KEYS
        | (
            frozenset({"hypothesisId", "scope", "resultHash"})
            if verdict_kind == "SUPPORTS"
            else frozenset({"reasonCode", "scope", "resultHash"})
            | (
                frozenset({"nextExperimentId"})
                if "nextExperimentId" in verdict
                else frozenset()
            )
        )
    )
    if verdict_kind not in {"SUPPORTS", "INCONCLUSIVE"}:
        raise HostedLabRunError("interactive exploration requires a released result")
    _exact_keys(verdict, verdict_keys, "evidenceVerdict")
    if (
        not _is_sha256(release_authority.get("authoritativeResultHash"))
        or not _is_sha256(release_authority.get("evidenceVerdictHash"))
        or not _is_sha256(release_authority.get("epistemicReportHash"))
        or release_authority.get("evidenceVerdictHash")
        != sha256_json_browser(verdict)
        or verdict.get("irHash")
        != compile_authority.get("selectedExperimentIrHash")
        or verdict.get("resultHash")
        != release_authority.get("authoritativeResultHash")
    ):
        raise HostedLabRunError("released result authority does not match")

    support = _mapping(manifest.get("support"), "artifact support")
    hypotheses = selected_ir.get("hypotheses")
    belief_hypotheses = belief.get("hypotheses")
    if (
        bundle.get("sessionId") != prediction.get("sessionId")
        or bundle.get("sessionId") != selected_ir.get("sessionId")
        or bundle.get("sessionId") != base_plan.get("sessionId")
        or belief.get("id") != prediction.get("beliefTestId")
        or belief.get("id") != selected_ir.get("beliefSpecId")
        or belief.get("id") != base_plan.get("beliefTestId")
        or belief.get("concept") != concept
        or concept != base_plan.get("concept")
        or belief.get("supportState") != "SUPPORTED"
        or belief.get("learnerDecision") != "CONFIRMED"
        or support.get("status") != "SUPPORTED"
        or selected_ir.get("artifactManifestHash") != manifest_hash
        or base_plan.get("artifactManifestHash") != manifest_hash
        or selected_ir.get("beliefSpecHash") != belief_hash
        or selected_ir.get("evidenceRefs") != belief.get("evidenceRefs")
        or not isinstance(hypotheses, list)
        or not isinstance(belief_hypotheses, list)
        or len(hypotheses) != 2
        or len(belief_hypotheses) != 2
    ):
        raise HostedLabRunError("interactive session and Belief Spec lineage fails")
    if [
        {
            key: _mapping(hypothesis, "IR hypothesis").get(key)
            for key in ("id", "statement", "conditions", "nonClaims")
        }
        for hypothesis in hypotheses
    ] != [
        {
            key: _mapping(hypothesis, "Belief Spec hypothesis").get(key)
            for key in ("id", "statement", "conditions", "nonClaims")
        }
        for hypothesis in belief_hypotheses
    ]:
        raise HostedLabRunError("interactive hypothesis lineage does not match")

    schema_summary = _mapping(manifest.get("schemaSummary"), "schemaSummary")
    entity_candidates = schema_summary.get("entityCandidates")
    if (
        concept == "entity_leakage"
        and (
            not isinstance(entity_candidates, list)
            or configuration.get("entityField") not in entity_candidates
        )
    ):
        raise HostedLabRunError("interactive entity field does not resolve")

    configuration_authority = {
        "schemaVersion": "1",
        "sessionId": bundle.get("sessionId"),
        "artifactManifestHash": manifest_hash,
        "selectedExperimentIrHash": compile_authority.get(
            "selectedExperimentIrHash"
        ),
        "selectionHash": compile_authority.get("selectionHash"),
        "projectedPlanHash": compile_authority.get("projectedPlanHash"),
        "authoritativeResultHash": release_authority.get(
            "authoritativeResultHash"
        ),
        "evidenceVerdictHash": release_authority.get("evidenceVerdictHash"),
        "epistemicReportHash": release_authority.get("epistemicReportHash"),
        "configuration": configuration,
    }
    configuration_hash = sha256_json_browser(configuration_authority)
    if bundle.get("configurationHash") != configuration_hash:
        raise HostedLabRunError("interactive configuration hash does not match")
    derived_plan, selected_run_id = _derive_interactive_plan_v5(
        base_plan,
        configuration,
        configuration_hash,
    )
    if (
        bundle.get("selectedRunId") != selected_run_id
        or dict(interactive_plan) != derived_plan
        or bundle.get("interactivePlanHash")
        != sha256_json_browser(interactive_plan)
    ):
        raise HostedLabRunError("interactive Plan does not match fixed derivation")
    if (
        result_output.get("path") != "verified-result.json"
        or result_output.get("schemaVersion") != "2"
        or result_output.get("authorityHash") != configuration_hash
    ):
        raise HostedLabRunError("interactive result output authority is invalid")

    learner_claim = belief.get("claim")
    if not isinstance(learner_claim, str) or not learner_claim.strip():
        raise HostedLabRunError("learner claim is required")
    return _execute_plan(
        interactive_plan,
        manifest,
        learner_claim,
        fixture,
    )


def _execute_v5(bundle: Mapping[str, Any]) -> dict[str, Any]:
    _exact_keys(bundle, _V5_BUNDLE_KEYS, "hosted LAB_RUN v5 bundle")
    if bundle.get("purpose") != "AUTHORITATIVE":
        raise HostedLabRunError("hosted LAB_RUN v5 purpose is invalid")
    if bundle.get("permittedOutputs") != ["verified-result.json"]:
        raise HostedLabRunError("hosted LAB_RUN v5 output policy is invalid")

    manifest = _mapping(bundle.get("artifactManifest"), "artifactManifest")
    belief = _mapping(bundle.get("approvedBeliefSpec"), "approvedBeliefSpec")
    prediction = _mapping(bundle.get("prediction"), "prediction")
    fixture = _mapping(bundle.get("fixture"), "fixture")
    selected_ir = _mapping(
        bundle.get("selectedExperimentIr"), "selectedExperimentIr"
    )
    _validate_experiment_ir(selected_ir)
    selection = _mapping(bundle.get("fixedSelection"), "fixedSelection")
    plan = _mapping(bundle.get("projectedPlan"), "projectedPlan")
    expected = _mapping(bundle.get("expectedHashes"), "expectedHashes")
    provenance = _mapping(bundle.get("provenance"), "provenance")
    result_output = _mapping(bundle.get("resultOutput"), "resultOutput")
    _exact_keys(expected, _V5_EXPECTED_HASH_KEYS, "expectedHashes")
    if not all(_is_sha256(value) for value in expected.values()):
        raise HostedLabRunError("expectedHashes contains an invalid digest")

    concept = selected_ir.get("concept")
    if concept not in _REGISTERED_FIXTURES:
        raise HostedLabRunError("no hosted fixed runner is registered for this concept")
    registered_fixture = _REGISTERED_FIXTURES[str(concept)]
    if dict(fixture) != registered_fixture:
        raise HostedLabRunError("fixture is not registered for the selected concept")
    manifest_hash = sha256_json_browser(manifest)
    belief_hash = sha256_json_browser(belief)
    prediction_base = {
        key: value for key, value in prediction.items() if key != "immutableHash"
    }
    if bundle.get("selectedExperimentIrHash") != expected.get(
        "selectedExperimentIr"
    ):
        raise HostedLabRunError("selected Experiment IR hash lineage does not match")
    if (
        bundle.get("artifactManifestHash") != manifest_hash
        or expected.get("artifactManifest") != manifest_hash
        or expected.get("beliefSpec") != belief_hash
        or bundle.get("beliefSpecHash") != belief_hash
        or expected.get("prediction") != prediction.get("immutableHash")
        or prediction.get("immutableHash") != sha256_json_browser(prediction_base)
        or expected.get("fixtureDescriptor") != sha256_json_browser(fixture)
        or expected.get("selectedExperimentIr")
        != sha256_json_browser(selected_ir)
        or expected.get("experimentSelection") != sha256_json_browser(selection)
        or expected.get("projectedPlan") != sha256_json_browser(plan)
    ):
        raise HostedLabRunError("v5 authoritative hash lineage does not match")
    if expected.get("rawExperimentIrCanonical") == expected.get(
        "selectedExperimentIr"
    ):
        raise HostedLabRunError(
            "raw and selected Experiment IR hashes must remain distinct"
        )

    compiler_hashes = _mapping(
        provenance.get("compilerOutputFileHashes"), "compilerOutputFileHashes"
    )
    _exact_keys(compiler_hashes, _COMPILER_OUTPUT_PATHS, "compilerOutputFileHashes")
    if (
        provenance.get("compileInputBundleHash")
        != expected.get("compileInputBundle")
        or compiler_hashes.get("experiment-ir.json")
        != expected.get("rawExperimentIrFile")
        or provenance.get("rawExperimentIrCanonicalHash")
        != expected.get("rawExperimentIrCanonical")
        or provenance.get("candidateVerificationReportHash")
        != expected.get("candidateVerificationReport")
        or provenance.get("scientificVerifierVersion")
        != "scientific-candidate-verifier-v1"
        or provenance.get("scorerVersion") != selection.get("scorerVersion")
        or provenance.get("projectionAdapterVersion")
        != "experiment-ir-v5-to-plan-v2-v1"
    ):
        raise HostedLabRunError("v5 compiler provenance lineage does not match")
    if (
        result_output.get("path") != "verified-result.json"
        or result_output.get("schemaVersion") != "2"
        or result_output.get("authoritativeInputHashes") != expected
    ):
        raise HostedLabRunError("v5 result output authority is invalid")

    ir_selection = _mapping(selected_ir.get("selection"), "IR selection")
    embedded_selection = {
        "eligibleCandidateIds": ir_selection.get("eligibleCandidateIds"),
        "rejectedCandidates": ir_selection.get("rejectedCandidates"),
        "selectedCandidateId": ir_selection.get("candidateId"),
        "minimumSeparation": ir_selection.get("minimumSeparation"),
        "requiredSeparation": ir_selection.get("requiredSeparation"),
        "complexityCost": ir_selection.get("complexityCost"),
        "normalizedScore": ir_selection.get("normalizedScore"),
        "scorerVersion": ir_selection.get("scorerVersion"),
    }
    if ir_selection.get("status") != "SELECTED" or embedded_selection != selection:
        raise HostedLabRunError("fixed Experiment Selection lineage does not match")
    if _project_selected_ir(selected_ir) != plan:
        raise HostedLabRunError("projected Plan does not match selected Experiment IR")

    hypotheses = selected_ir.get("hypotheses")
    belief_hypotheses = belief.get("hypotheses")
    support = _mapping(manifest.get("support"), "artifact support")
    if (
        not isinstance(hypotheses, list)
        or len(hypotheses) != 2
        or not all(isinstance(hypothesis, Mapping) for hypothesis in hypotheses)
        or not isinstance(belief_hypotheses, list)
        or len(belief_hypotheses) != 2
        or not all(
            isinstance(hypothesis, Mapping) for hypothesis in belief_hypotheses
        )
    ):
        raise HostedLabRunError("v5 Belief Spec hypotheses are invalid")
    if (
        bundle.get("sessionId") != prediction.get("sessionId")
        or bundle.get("sessionId") != selected_ir.get("sessionId")
        or bundle.get("sessionId") != plan.get("sessionId")
        or belief.get("id") != prediction.get("beliefTestId")
        or belief.get("id") != selected_ir.get("beliefSpecId")
        or belief.get("id") != plan.get("beliefTestId")
        or belief.get("concept") != concept
        or concept != plan.get("concept")
        or belief.get("supportState") != "SUPPORTED"
        or belief.get("learnerDecision") != "CONFIRMED"
        or support.get("status") != "SUPPORTED"
        or selected_ir.get("artifactManifestHash") != manifest_hash
        or plan.get("artifactManifestHash") != manifest_hash
        or selected_ir.get("beliefSpecHash") != belief_hash
        or selected_ir.get("evidenceRefs") != belief.get("evidenceRefs")
        or [
            {
                key: hypothesis.get(key)
                for key in ("id", "statement", "conditions", "nonClaims")
            }
            for hypothesis in hypotheses
        ]
        != [
            {
                key: hypothesis.get(key)
                for key in ("id", "statement", "conditions", "nonClaims")
            }
            for hypothesis in belief_hypotheses
        ]
    ):
        raise HostedLabRunError("v5 session and Belief Spec lineage does not match")
    learner_claim = belief.get("claim")
    if not isinstance(learner_claim, str) or not learner_claim.strip():
        raise HostedLabRunError("learner claim is required")
    return _execute_plan(plan, manifest, learner_claim, fixture)


def _execute_v1(bundle: Mapping[str, Any]) -> dict[str, Any]:
    _exact_keys(bundle, _V1_BUNDLE_KEYS, "hosted LAB_RUN bundle")
    if bundle.get("purpose") not in {"AUTHORITATIVE", "INTERACTIVE"}:
        raise HostedLabRunError("hosted LAB_RUN purpose is invalid")
    if bundle.get("permittedOutputs") != ["verified-result.json"]:
        raise HostedLabRunError("hosted LAB_RUN output policy is invalid")

    manifest = _mapping(bundle.get("artifactManifest"), "artifactManifest")
    plan = _mapping(bundle.get("experimentPlan"), "experimentPlan")
    fixture = _mapping(bundle.get("fixture"), "fixture")
    manifest_hash = sha256_json(manifest)
    if bundle.get("artifactManifestHash") != manifest_hash:
        raise HostedLabRunError("artifact manifest hash does not match bundle bytes")
    if bundle.get("experimentPlanHash") != sha256_json(plan):
        raise HostedLabRunError("experiment plan hash does not match bundle bytes")
    if (
        plan.get("sessionId") != bundle.get("sessionId")
        or plan.get("artifactManifestHash") != manifest_hash
    ):
        raise HostedLabRunError("experiment plan lineage does not match LAB_RUN job")
    concept = plan.get("concept")
    if concept not in _REGISTERED_FIXTURES:
        raise HostedLabRunError("no hosted fixed runner is registered for this concept")
    registered = _REGISTERED_FIXTURES[str(concept)]
    if fixture.get("id") != registered["id"]:
        raise HostedLabRunError(f"fixture is not registered for {concept}")
    learner_claim = bundle.get("learnerClaim")
    if not isinstance(learner_claim, str) or not learner_claim.strip():
        raise HostedLabRunError("learner claim is required")
    return _execute_plan(plan, manifest, learner_claim, registered)


def execute_hosted_lab_run(bundle: Mapping[str, Any]) -> dict[str, Any]:
    """Validate one scoped LAB_RUN bundle and execute fixed registered operations."""
    if bundle.get("kind") != "LAB_RUN":
        raise HostedLabRunError("hosted LAB_RUN bundle kind is invalid")
    if bundle.get("schemaVersion") == "5":
        if bundle.get("purpose") == "INTERACTIVE":
            return _execute_v5_interactive(bundle)
        return _execute_v5(bundle)
    if bundle.get("schemaVersion") == "1":
        return _execute_v1(bundle)
    raise HostedLabRunError("hosted LAB_RUN bundle version is invalid")


def _read_bundle(path: Path) -> Mapping[str, Any]:
    if path.stat().st_size > _MAX_BUNDLE_BYTES:
        raise HostedLabRunError("hosted LAB_RUN bundle exceeds the size limit")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HostedLabRunError("hosted LAB_RUN bundle is not valid JSON") from error
    return _mapping(value, "bundle")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a fixed CounterLab hosted lab")
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = execute_hosted_lab_run(_read_bundle(args.bundle))
    args.output.write_text(canonical_json(result) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
