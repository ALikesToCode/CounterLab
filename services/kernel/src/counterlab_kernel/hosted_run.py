"""Artifact-bound entrypoint for hosted fixed-kernel lab jobs."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
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
