from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
import json
from pathlib import Path

import pytest

from counterlab_kernel.canonical import canonical_json, sha256_json_browser
from counterlab_kernel.hosted_run import (
    HostedLabRunError,
    execute_hosted_lab_run,
    main,
)
from test_imbalance_plan import plan as imbalance_plan
from test_plan_interpreter import v5_bundle


LEAKAGE_REQUEST = {
    "sweepId": "leakage-recurrence-sweep",
    "axisIds": ["test_fraction", "observations_per_entity"],
    "gridPresetId": "leakage-boundary-grid-v1",
    "observableId": "optimism_gap",
    "maxCells": 25,
}
IMBALANCE_REQUEST = {
    "sweepId": "imbalance-threshold-prevalence-sweep",
    "axisIds": ["class_prevalence", "decision_threshold"],
    "gridPresetId": "imbalance-boundary-grid-v1",
    "observableId": "f1",
    "maxCells": 15,
}


def _imbalance_ir(source: dict[str, object]) -> dict[str, object]:
    selected_ir = deepcopy(source["selectedExperimentIr"])
    plan = imbalance_plan()
    candidate_id = "threshold-prevalence-comparison"
    selected_ir.update(
        {
            "irId": "ir-imbalance-boundary-1",
            "executionPlanId": plan["planId"],
            "sessionId": plan["sessionId"],
            "concept": "class_imbalance",
            "conceptPackVersion": "1.1.0",
            "artifactManifestHash": "a" * 64,
            "beliefSpecId": plan["beliefTestId"],
            "evidenceRefs": plan["evidenceRefs"],
            "visualizations": plan["visualizations"],
            "transfer": {
                "taskId": "manufacturing-defect-transfer-v1",
                "changedSurface": "Rare manufacturing defect detection",
                "requiredActionIds": ["choose_cost_sensitive_threshold"],
                "nonClaims": ["This does not select a production threshold."],
            },
            "nonClaims": plan["nonClaims"],
            "resourceLimits": plan["resourceLimits"],
            "boundarySweep": IMBALANCE_REQUEST,
        }
    )
    selected_ir["hypotheses"] = [
        {
            "id": "current",
            "statement": "High accuracy means minority cases are detected.",
            "conditions": ["The positive class is rare."],
            "nonClaims": ["This does not establish deployment utility."],
            "predictedPattern": {
                "patternId": "imbalance.high-utility",
                "description": "Minority utility stays strong across thresholds.",
            },
        },
        {
            "id": "competing",
            "statement": "Prevalence can make a weak detector look accurate.",
            "conditions": ["The positive class is rare."],
            "nonClaims": ["This does not establish deployment utility."],
            "predictedPattern": {
                "patternId": "imbalance.threshold-sensitive",
                "description": "Minority utility changes with threshold and prevalence.",
            },
        },
    ]
    selected_ir["candidateExperiments"] = [
        {
            "id": candidate_id,
            "title": "Compare minority utility across threshold and prevalence",
            "operationIds": [
                "imbalance.majority_baseline",
                "imbalance.stratified_holdout",
                "imbalance.threshold_sweep",
                "imbalance.prevalence_sweep",
            ],
            "baseline": plan["baseline"],
            "interventions": plan["interventions"],
            "heldConstantIds": [
                "control.fixture",
                "control.split",
                "control.model_score",
                "control.seed",
            ],
            "changedVariableIds": [
                "change.metric",
                "change.threshold",
                "change.prevalence",
            ],
            "observableIds": plan["metrics"],
            "hypothesisPatterns": [
                {
                    "hypothesisId": "current",
                    "patternId": "imbalance.high-utility",
                },
                {
                    "hypothesisId": "competing",
                    "patternId": "imbalance.threshold-sensitive",
                },
            ],
            "inconclusiveConditionIds": ["metrics-within-tolerance"],
            "complexityCost": 5,
            "discriminatesBecause": plan["discriminatesBecause"],
        }
    ]
    selected_ir["selection"] = {
        "status": "SELECTED",
        "candidateId": candidate_id,
        "eligibleCandidateIds": [candidate_id],
        "rejectedCandidates": [],
        "minimumSeparation": 0.82,
        "requiredSeparation": 0.4,
        "complexityCost": 5,
        "normalizedScore": 0.8,
        "scorerVersion": "experiment-scorer-v1",
    }
    selected_ir["inconclusiveConditions"] = [
        {
            "id": "metrics-within-tolerance",
            "description": "The observed utility difference is not decisive.",
        }
    ]
    return selected_ir


def boundary_bundle(concept: str = "entity_leakage") -> dict[str, object]:
    authoritative = v5_bundle()
    if concept == "entity_leakage":
        selected_ir = deepcopy(authoritative["selectedExperimentIr"])
        selected_ir["conceptPackVersion"] = "2.1.0"
        selected_ir["boundarySweep"] = deepcopy(LEAKAGE_REQUEST)
        fixture = authoritative["fixture"]
        seed = 1729
        request = LEAKAGE_REQUEST
    else:
        selected_ir = _imbalance_ir(authoritative)
        fixture = {
            "id": "public-imbalance-v1",
            "version": "imbalance-fixture-v1",
            "contentSha256": (
                "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f"
            ),
        }
        seed = 2603
        request = IMBALANCE_REQUEST

    selected_ir_hash = sha256_json_browser(selected_ir)
    authoritative_result_hash = "d" * 64
    evidence_verdict = {
        "schemaVersion": "1",
        "kind": "SUPPORTS",
        "hypothesisId": "competing",
        "scope": "The documented public fixture and bounded evaluation conditions.",
        "resultHash": authoritative_result_hash,
        "irHash": selected_ir_hash,
        "technicalReportHash": "e" * 64,
        "verifierVersion": "epistemic-verifier-v1",
    }
    evidence_verdict_hash = sha256_json_browser(evidence_verdict)
    artifact_manifest_hash = selected_ir["artifactManifestHash"]
    result_lineage = {
        "artifactManifestHash": artifact_manifest_hash,
        "experimentIrHash": selected_ir_hash,
        "authoritativeResultHash": authoritative_result_hash,
        "evidenceVerdictHash": evidence_verdict_hash,
    }
    return {
        "schemaVersion": "5",
        "kind": "LAB_RUN",
        "purpose": "BOUNDARY",
        "jobId": f"job_boundary_{concept}_1",
        "sessionId": selected_ir["sessionId"],
        "stateVersion": 14,
        "artifactManifestHash": artifact_manifest_hash,
        "fixture": fixture,
        "conceptPackVersion": selected_ir["conceptPackVersion"],
        "selectedExperimentIr": selected_ir,
        "selectedExperimentIrHash": selected_ir_hash,
        "releaseAuthority": {
            "authoritativeResultHash": authoritative_result_hash,
            "evidenceVerdict": evidence_verdict,
            "evidenceVerdictHash": evidence_verdict_hash,
            "epistemicReportHash": "f" * 64,
        },
        "boundaryRequest": deepcopy(request),
        "seed": seed,
        "resultOutput": {
            "path": "boundary-map.json",
            "schemaVersion": "1",
            "lineage": result_lineage,
        },
        "permittedOutputs": ["boundary-map.json"],
    }


def _reauthorize_selected_ir(bundle: dict[str, object]) -> None:
    selected_ir_hash = sha256_json_browser(bundle["selectedExperimentIr"])
    bundle["selectedExperimentIrHash"] = selected_ir_hash
    release = bundle["releaseAuthority"]
    verdict = release["evidenceVerdict"]  # type: ignore[index]
    verdict["irHash"] = selected_ir_hash  # type: ignore[index]
    release["evidenceVerdictHash"] = sha256_json_browser(verdict)  # type: ignore[index]
    lineage = bundle["resultOutput"]["lineage"]  # type: ignore[index]
    lineage["experimentIrHash"] = selected_ir_hash  # type: ignore[index]
    lineage["evidenceVerdictHash"] = release["evidenceVerdictHash"]  # type: ignore[index]


@pytest.mark.parametrize(
    ("concept", "expected_cells", "expected_axes"),
    [
        (
            "entity_leakage",
            25,
            ["test_fraction", "observations_per_entity"],
        ),
        (
            "class_imbalance",
            15,
            ["class_prevalence", "decision_threshold"],
        ),
    ],
)
def test_hosted_boundary_executes_only_the_registered_fixed_grid(
    concept: str,
    expected_cells: int,
    expected_axes: list[str],
) -> None:
    bundle = boundary_bundle(concept)

    result = execute_hosted_lab_run(bundle)

    assert result["schemaVersion"] == "1"
    assert result["concept"] == concept
    assert len(result["cells"]) == expected_cells
    assert [axis["id"] for axis in result["axes"]] == expected_axes
    assert result["sessionId"] == bundle["sessionId"]
    assert result["conceptPackVersion"] == bundle["conceptPackVersion"]
    assert result["artifactManifestHash"] == bundle["artifactManifestHash"]
    assert result["experimentIrHash"] == bundle["selectedExperimentIrHash"]
    assert (
        result["authoritativeResultHash"]
        == bundle["releaseAuthority"]["authoritativeResultHash"]
    )
    assert (
        result["evidenceVerdictHash"]
        == bundle["releaseAuthority"]["evidenceVerdictHash"]
    )


@pytest.mark.parametrize("concept", ["entity_leakage", "class_imbalance"])
def test_hosted_boundary_is_deterministic_and_browser_canonical(concept: str) -> None:
    bundle = boundary_bundle(concept)

    first = execute_hosted_lab_run(bundle)
    second = execute_hosted_lab_run(bundle)
    unsigned = {key: value for key, value in first.items() if key != "resultHash"}

    assert first == second
    assert first["resultHash"] == sha256_json_browser(unsigned)


def test_hosted_boundary_accepts_a_valid_inconclusive_release() -> None:
    bundle = boundary_bundle()
    release = bundle["releaseAuthority"]
    release["evidenceVerdict"] = {  # type: ignore[index]
        "schemaVersion": "1",
        "kind": "INCONCLUSIVE",
        "reasonCode": "GAP_WITHIN_TOLERANCE",
        "scope": "The documented public fixture and bounded conditions.",
        "resultHash": release["authoritativeResultHash"],  # type: ignore[index]
        "irHash": bundle["selectedExperimentIrHash"],
        "technicalReportHash": "e" * 64,
        "verifierVersion": "epistemic-verifier-v1",
    }
    release["evidenceVerdictHash"] = sha256_json_browser(  # type: ignore[index]
        release["evidenceVerdict"]  # type: ignore[index]
    )
    bundle["resultOutput"]["lineage"]["evidenceVerdictHash"] = release[  # type: ignore[index]
        "evidenceVerdictHash"
    ]

    result = execute_hosted_lab_run(bundle)

    assert result["evidenceVerdictHash"] == release["evidenceVerdictHash"]  # type: ignore[index]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("axisIds", ["observations_per_entity", "test_fraction"]),
        ("observableId", "accuracy"),
        ("gridPresetId", "leakage-boundary-grid-v2"),
        ("maxCells", 24),
    ],
)
def test_hosted_boundary_rejects_an_ir_authorized_but_unregistered_sweep(
    field: str,
    value: object,
) -> None:
    bundle = boundary_bundle()
    bundle["boundaryRequest"][field] = value  # type: ignore[index]
    bundle["selectedExperimentIr"]["boundarySweep"][field] = value  # type: ignore[index]
    _reauthorize_selected_ir(bundle)

    with pytest.raises(
        HostedLabRunError,
        match="registered Boundary Map request",
    ):
        execute_hosted_lab_run(bundle)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (
            lambda bundle: bundle["boundaryRequest"].update(  # type: ignore[union-attr]
                {"axisIds": ["observations_per_entity", "test_fraction"]}
            ),
            "registered Boundary Map request",
        ),
        (
            lambda bundle: bundle["boundaryRequest"].update(  # type: ignore[union-attr]
                {"observableId": "accuracy"}
            ),
            "registered Boundary Map request",
        ),
        (
            lambda bundle: bundle["boundaryRequest"].update(  # type: ignore[union-attr]
                {"gridPresetId": "leakage-boundary-grid-v2"}
            ),
            "registered Boundary Map request",
        ),
        (
            lambda bundle: bundle["boundaryRequest"].update(  # type: ignore[union-attr]
                {"maxCells": 24}
            ),
            "registered Boundary Map request",
        ),
        (
            lambda bundle: bundle.update(
                {
                    "fixture": {
                        "id": "public-imbalance-v1",
                        "version": "imbalance-fixture-v1",
                        "contentSha256": "7" * 64,
                    }
                }
            ),
            "fixture",
        ),
        (
            lambda bundle: bundle.update({"selectedExperimentIrHash": "0" * 64}),
            "Experiment IR hash lineage",
        ),
        (
            lambda bundle: bundle["resultOutput"]["lineage"].update(  # type: ignore[index,union-attr]
                {"authoritativeResultHash": "0" * 64}
            ),
            "output lineage",
        ),
        (
            lambda bundle: bundle.update({"seed": 2603}),
            "seed does not match selected candidate runs",
        ),
        (
            lambda bundle: bundle.update({"permittedOutputs": ["result.json"]}),
            "output policy",
        ),
        (
            lambda bundle: bundle.update({"shell": "python arbitrary.py"}),
            "fields are invalid",
        ),
    ],
)
def test_hosted_boundary_rejects_request_and_lineage_drift(
    mutation: Callable[[dict[str, object]], object],
    message: str,
) -> None:
    bundle = boundary_bundle()
    mutation(bundle)  # type: ignore[operator]

    with pytest.raises(HostedLabRunError, match=message):
        execute_hosted_lab_run(bundle)


def test_hosted_boundary_rejects_a_rejected_evidence_verdict() -> None:
    bundle = boundary_bundle()
    release = bundle["releaseAuthority"]
    release["evidenceVerdict"] = {  # type: ignore[index]
        "schemaVersion": "1",
        "kind": "REJECTED",
        "findingIds": ["finding-confounded"],
        "irHash": bundle["selectedExperimentIrHash"],
        "technicalReportHash": "e" * 64,
        "verifierVersion": "epistemic-verifier-v1",
    }
    release["evidenceVerdictHash"] = sha256_json_browser(  # type: ignore[index]
        release["evidenceVerdict"]  # type: ignore[index]
    )

    with pytest.raises(HostedLabRunError, match="released result"):
        execute_hosted_lab_run(bundle)


def test_hosted_boundary_cli_writes_canonical_boundary_map(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundle = boundary_bundle()
    bundle_path = tmp_path / "boundary-bundle.json"
    output_path = tmp_path / "boundary-map.json"
    bundle_path.write_text(json.dumps(bundle), encoding="utf-8")
    monkeypatch.setattr(
        "sys.argv",
        [
            "counterlab-hosted-run",
            "--bundle",
            str(bundle_path),
            "--output",
            str(output_path),
        ],
    )

    main()

    result = execute_hosted_lab_run(bundle)
    assert output_path.read_text(encoding="utf-8") == canonical_json(result) + "\n"
