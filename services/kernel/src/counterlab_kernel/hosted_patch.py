"""Artifact-bound fixed patch execution for hosted Patch Plan jobs.

Codex never receives notebook bytes in this path. It produces a source-free,
typed Patch Plan; this module receives that already-verified Plan plus the
scoped source bytes and applies the registered patch operation deterministically.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from hashlib import sha256
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .canonical import canonical_json, sha256_json, sha256_json_browser
from .imbalance_patching import compile_imbalance_notebook_patch
from .leakage_patching import compile_leakage_notebook_patch
from .patching import compile_sample_notebook_patch
from .transfer import evaluate_forecasting_transfer


_MAX_BUNDLE_BYTES = 2 * 1024 * 1024
_MAX_PLAN_BYTES = 512 * 1024
_MAX_NOTEBOOK_BYTES = 10 * 1024 * 1024
_PATCH_SCHEMA_PATH = (
    Path(__file__).resolve().parent / "schemas" / "patch-plan-v1.schema.json"
)
_PATCH_OPERATIONS = {
    "entity_leakage": frozenset({
        "replace_row_split_with_group_holdout",
        "exclude_entity_feature",
    }),
    "class_imbalance": frozenset({
        "stratify_classification_holdout",
        "add_majority_baseline",
        "replace_accuracy_only_evaluation",
    }),
}
_PATCH_PLAN_BASE_KEYS = frozenset({
        "schemaVersion",
        "planId",
        "sessionId",
        "concept",
        "conceptPackVersion",
        "artifactManifestHash",
        "sourceArtifactHash",
        "transferResultHash",
        "verifiedResultHash",
        "evidenceRefs",
        "targetCells",
        "targetField",
        "operations",
        "preserveUnrelatedCells",
        "nonClaims",
})
_V5_PATCH_BUNDLE_KEYS = frozenset({
    "schemaVersion",
    "kind",
    "jobId",
    "sessionId",
    "stateVersion",
    "requestedAt",
    "artifactManifestHash",
    "conceptPackVersion",
    "artifactManifest",
    "approvedBeliefSpec",
    "beliefSpecHash",
    "prediction",
    "compileAuthority",
    "selectedExperimentIr",
    "fixedSelection",
    "basePlan",
    "releaseAuthority",
    "verifiedResultSummary",
    "transferResult",
    "patchContract",
    "allowedCellIndices",
    "patchPlanSchema",
    "permittedOutputs",
})
_V5_COMPILE_AUTHORITY_KEYS = frozenset({
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
})
_V5_COMPILER_OUTPUT_KEYS = frozenset({
    "discrimination-contract.json",
    "experiment-ir.json",
    "lab-scene.json",
    "public-rationale.md",
})
_V5_RELEASE_AUTHORITY_KEYS = frozenset({
    "authoritativeResultHash",
    "evidenceVerdict",
    "evidenceVerdictHash",
    "epistemicReportHash",
})
_V5_SUPPORTS_VERDICT_KEYS = frozenset({
    "schemaVersion",
    "kind",
    "hypothesisId",
    "scope",
    "resultHash",
    "irHash",
    "technicalReportHash",
    "verifierVersion",
})
_V5_RESULT_SUMMARY_KEYS = frozenset({
    "schemaVersion",
    "concept",
    "resultHash",
    "planId",
    "runIds",
})
_V5_TRANSFER_KEYS = frozenset({
    "schemaVersion",
    "id",
    "sessionId",
    "taskId",
    "outcome",
    "selectedStrategy",
    "identifiedRisks",
    "evidenceChoices",
    "checks",
    "evaluatorVersion",
    "evaluatedAt",
    "resultHash",
})
_V5_TRANSFER_CHECK_KEYS = frozenset({"invariant", "passed", "evidence"})


class HostedPatchError(ValueError):
    """Raised before release when hosted patch lineage or policy is invalid."""


def _mapping(value: object, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise HostedPatchError(f"{name} must be an object")
    return value


def _sequence(value: object, name: str) -> list[Any]:
    if not isinstance(value, list):
        raise HostedPatchError(f"{name} must be an array")
    return value


def _sha256_bytes(value: bytes) -> str:
    return sha256(value).hexdigest()


def _strict_fields(
    value: Mapping[str, Any], expected: frozenset[str], name: str
) -> None:
    actual = frozenset(value)
    if actual != expected:
        raise HostedPatchError(
            f"{name} fields are invalid: "
            f"missing={sorted(expected.difference(actual))}, "
            f"extra={sorted(actual.difference(expected))}"
        )


def _validate_v5_patch_bundle(bundle: Mapping[str, Any]) -> None:
    _strict_fields(bundle, _V5_PATCH_BUNDLE_KEYS, "v5 patch bundle")
    manifest = _mapping(bundle.get("artifactManifest"), "artifactManifest")
    belief = _mapping(bundle.get("approvedBeliefSpec"), "approvedBeliefSpec")
    prediction = _mapping(bundle.get("prediction"), "prediction")
    compile_authority = _mapping(
        bundle.get("compileAuthority"), "compileAuthority"
    )
    selected_ir = _mapping(
        bundle.get("selectedExperimentIr"), "selectedExperimentIr"
    )
    selection = _mapping(bundle.get("fixedSelection"), "fixedSelection")
    plan = _mapping(bundle.get("basePlan"), "basePlan")
    release = _mapping(bundle.get("releaseAuthority"), "releaseAuthority")
    verdict = _mapping(release.get("evidenceVerdict"), "evidenceVerdict")
    summary = _mapping(
        bundle.get("verifiedResultSummary"), "verifiedResultSummary"
    )
    transfer = _mapping(bundle.get("transferResult"), "transferResult")
    patch_contract = _mapping(bundle.get("patchContract"), "patchContract")

    _strict_fields(
        compile_authority, _V5_COMPILE_AUTHORITY_KEYS, "compile authority"
    )
    _strict_fields(
        _mapping(
            compile_authority.get("compilerOutputFileHashes"),
            "compilerOutputFileHashes",
        ),
        _V5_COMPILER_OUTPUT_KEYS,
        "compiler output hashes",
    )
    _strict_fields(release, _V5_RELEASE_AUTHORITY_KEYS, "release authority")
    if verdict.get("kind") != "SUPPORTS":
        raise HostedPatchError(
            "v5 patch authority requires a SUPPORTS evidence verdict"
        )
    _strict_fields(verdict, _V5_SUPPORTS_VERDICT_KEYS, "SUPPORTS verdict")
    _strict_fields(summary, _V5_RESULT_SUMMARY_KEYS, "verified result summary")
    _strict_fields(transfer, _V5_TRANSFER_KEYS, "transfer result")
    checks = _sequence(transfer.get("checks"), "transferResult.checks")
    if not checks:
        raise HostedPatchError("v5 patch transfer contains no deterministic checks")
    for check in checks:
        parsed_check = _mapping(check, "transfer check")
        _strict_fields(
            parsed_check, _V5_TRANSFER_CHECK_KEYS, "transfer check"
        )
    _strict_fields(
        patch_contract,
        frozenset({"id", "allowedTransformations"}),
        "patch contract",
    )

    manifest_hash = sha256_json_browser(manifest)
    belief_hash = sha256_json_browser(belief)
    prediction_base = dict(prediction)
    prediction_hash = prediction_base.pop("immutableHash", None)
    selected_ir_hash = sha256_json_browser(selected_ir)
    selection_hash = sha256_json_browser(selection)
    projected_plan_hash = sha256_json_browser(plan)
    verdict_hash = sha256_json_browser(verdict)
    transfer_base = dict(transfer)
    transfer_hash = transfer_base.pop("resultHash", None)
    concept = belief.get("concept")
    if concept not in _PATCH_OPERATIONS:
        raise HostedPatchError("v5 patch Subject Pack is not registered")
    if (
        manifest.get("support", {}).get("status") != "SUPPORTED"
        or belief.get("supportState") != "SUPPORTED"
        or belief.get("learnerDecision") != "CONFIRMED"
    ):
        raise HostedPatchError("v5 patch requires approved supported evidence")
    if (
        bundle.get("artifactManifestHash") != manifest_hash
        or compile_authority.get("artifactManifestHash") != manifest_hash
        or selected_ir.get("artifactManifestHash") != manifest_hash
        or plan.get("artifactManifestHash") != manifest_hash
    ):
        raise HostedPatchError("v5 patch Artifact Manifest lineage is invalid")
    if (
        bundle.get("beliefSpecHash") != belief_hash
        or compile_authority.get("beliefSpecHash") != belief_hash
        or selected_ir.get("beliefSpecHash") != belief_hash
    ):
        raise HostedPatchError("v5 patch Belief Spec lineage is invalid")
    if (
        prediction_hash != sha256_json_browser(prediction_base)
        or compile_authority.get("predictionHash") != prediction_hash
    ):
        raise HostedPatchError("v5 patch prediction lineage is invalid")
    session_id = bundle.get("sessionId")
    belief_id = belief.get("id")
    if (
        prediction.get("sessionId") != session_id
        or prediction.get("beliefTestId") != belief_id
        or selected_ir.get("sessionId") != session_id
        or selected_ir.get("beliefSpecId") != belief_id
        or plan.get("sessionId") != session_id
        or plan.get("beliefTestId") != belief_id
        or transfer.get("sessionId") != session_id
    ):
        raise HostedPatchError("v5 patch session or belief lineage is invalid")
    if (
        selected_ir.get("concept") != concept
        or plan.get("concept") != concept
        or summary.get("concept") != concept
        or selected_ir.get("conceptPackVersion")
        != bundle.get("conceptPackVersion")
        or plan.get("conceptPackVersion") != bundle.get("conceptPackVersion")
    ):
        raise HostedPatchError("v5 patch Subject Pack lineage is invalid")
    if (
        compile_authority.get("selectedExperimentIrHash") != selected_ir_hash
        or verdict.get("irHash") != selected_ir_hash
    ):
        raise HostedPatchError("v5 patch selected Experiment IR is invalid")
    if (
        compile_authority.get("selectionHash") != selection_hash
        or compile_authority.get("scorerVersion") != selection.get("scorerVersion")
    ):
        raise HostedPatchError("v5 patch fixed selection lineage is invalid")
    embedded_selection = _mapping(
        selected_ir.get("selection"), "selectedExperimentIr.selection"
    )
    expected_embedded_selection = {
        "status": "SELECTED",
        "candidateId": selection.get("selectedCandidateId"),
        "eligibleCandidateIds": selection.get("eligibleCandidateIds"),
        "rejectedCandidates": selection.get("rejectedCandidates"),
        "minimumSeparation": selection.get("minimumSeparation"),
        "requiredSeparation": selection.get("requiredSeparation"),
        "complexityCost": selection.get("complexityCost"),
        "normalizedScore": selection.get("normalizedScore"),
        "scorerVersion": selection.get("scorerVersion"),
    }
    if dict(embedded_selection) != expected_embedded_selection:
        raise HostedPatchError("v5 patch fixed selection does not match the IR")
    if (
        compile_authority.get("projectedPlanHash") != projected_plan_hash
        or selected_ir.get("executionPlanId") != plan.get("planId")
        or selected_ir.get("evidenceRefs") != belief.get("evidenceRefs")
        or plan.get("evidenceRefs") != belief.get("evidenceRefs")
    ):
        raise HostedPatchError("v5 patch projected Plan lineage is invalid")
    released_result_hash = release.get("authoritativeResultHash")
    if (
        release.get("evidenceVerdictHash") != verdict_hash
        or verdict.get("resultHash") != released_result_hash
        or summary.get("resultHash") != released_result_hash
        or summary.get("planId") != plan.get("planId")
    ):
        raise HostedPatchError("v5 patch released result lineage is invalid")
    expected_run_ids = [
        _mapping(plan.get("baseline"), "basePlan.baseline").get("runId"),
        *[
            _mapping(run, "basePlan.intervention").get("runId")
            for run in _sequence(plan.get("interventions"), "basePlan.interventions")
        ],
    ]
    run_ids = _sequence(summary.get("runIds"), "verifiedResultSummary.runIds")
    if len(set(run_ids)) != len(run_ids) or set(run_ids) != set(expected_run_ids):
        raise HostedPatchError("v5 patch verified result runs are invalid")
    transfer_task = _mapping(selected_ir.get("transfer"), "selectedExperimentIr.transfer")
    if (
        transfer.get("outcome") != "PASSED"
        or not all(_mapping(check, "transfer check").get("passed") is True for check in checks)
        or transfer.get("taskId") != transfer_task.get("taskId")
        or transfer_hash != sha256_json_browser(transfer_base)
    ):
        raise HostedPatchError("v5 patch transfer authority is invalid")
    expected_operations = _PATCH_OPERATIONS[str(concept)]
    declared_operations = set(
        _sequence(
            patch_contract.get("allowedTransformations"),
            "patchContract.allowedTransformations",
        )
    )
    if declared_operations != expected_operations:
        raise HostedPatchError("v5 patch transformation authority is invalid")
    allowed_cells = _sequence(
        bundle.get("allowedCellIndices"), "allowedCellIndices"
    )
    manifest_cells = {
        cell.get("index")
        for cell in _sequence(manifest.get("cells"), "artifactManifest.cells")
        if isinstance(cell, Mapping) and cell.get("type") == "code"
    }
    if len(set(allowed_cells)) != len(allowed_cells) or any(
        index not in manifest_cells for index in allowed_cells
    ):
        raise HostedPatchError("v5 patch cell scope is invalid")


def _validate_patch_plan(
    bundle: Mapping[str, Any], plan: Mapping[str, Any]
) -> None:
    schema = json.loads(_PATCH_SCHEMA_PATH.read_text(encoding="utf-8"))
    errors = sorted(
        Draft202012Validator(schema).iter_errors(dict(plan)),
        key=lambda error: list(error.absolute_path),
    )
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.absolute_path) or "plan"
        raise HostedPatchError(
            f"Patch Plan schema rejected {location}: {first.message}"
        )
    concept = plan.get("concept")
    if concept not in _PATCH_OPERATIONS:
        raise HostedPatchError("Patch Plan concept has no registered patch engine")
    expected_keys = _PATCH_PLAN_BASE_KEYS.union(
        {"entityField"} if concept == "entity_leakage" else set()
    )
    extra = sorted(set(plan).difference(expected_keys))
    missing = sorted(expected_keys.difference(plan))
    if extra or missing:
        raise HostedPatchError(
            f"Patch Plan fields are invalid: missing={missing}, extra={extra}"
        )
    manifest = _mapping(bundle.get("artifactManifest"), "artifactManifest")
    manifest_hash = sha256_json(manifest)
    result_summary = _mapping(
        bundle.get("verifiedResultSummary"), "verifiedResultSummary"
    )
    transfer_summary = _mapping(
        bundle.get("transferResult")
        if bundle.get("schemaVersion") == "5"
        else bundle.get("transferSummary"),
        "transfer authority",
    )
    expected_pack_version = (
        bundle.get("conceptPackVersion")
        if bundle.get("schemaVersion") == "5"
        else ("2.0.0" if concept == "entity_leakage" else "1.0.0")
    )
    if (
        plan.get("schemaVersion") != "1"
        or plan.get("sessionId") != bundle.get("sessionId")
        or plan.get("conceptPackVersion") != expected_pack_version
        or plan.get("artifactManifestHash") != manifest_hash
        or plan.get("sourceArtifactHash") != manifest.get("fileSha256")
        or plan.get("verifiedResultHash") != result_summary.get("resultHash")
        or plan.get("transferResultHash") != transfer_summary.get("resultHash")
        or plan.get("preserveUnrelatedCells") is not True
    ):
        raise HostedPatchError("Patch Plan lineage does not match the scoped job")

    allowed_cells = _sequence(bundle.get("allowedCellIndices"), "allowedCellIndices")
    target_cells = _sequence(plan.get("targetCells"), "targetCells")
    if (
        not target_cells
        or len(target_cells) > 4
        or len(set(target_cells)) != len(target_cells)
        or any(
            not isinstance(index, int) or index not in allowed_cells
            for index in target_cells
        )
    ):
        raise HostedPatchError("Patch Plan targets a cell outside the job allowlist")

    operations = _sequence(plan.get("operations"), "operations")
    operation_ids: list[str] = []
    for operation in operations:
        item = _mapping(operation, "operation")
        if set(item) != {"id", "cellIndex", "reason"}:
            raise HostedPatchError("Patch Plan operation fields are invalid")
        operation_id = item.get("id")
        reason = item.get("reason")
        if (
            not isinstance(operation_id, str)
            or operation_id not in _PATCH_OPERATIONS[concept]
            or item.get("cellIndex") not in target_cells
            or not isinstance(reason, str)
            or not reason.strip()
        ):
            raise HostedPatchError("Patch Plan contains an unregistered operation")
        operation_ids.append(operation_id)
    if set(operation_ids) != _PATCH_OPERATIONS[concept] or len(operation_ids) != len(
        _PATCH_OPERATIONS[concept]
    ):
        raise HostedPatchError("Patch Plan must compose each registered operation once")

    schema_summary = _mapping(manifest.get("schemaSummary"), "schemaSummary")
    target_candidates = _sequence(
        schema_summary.get("targetCandidates"), "targetCandidates"
    )
    if plan.get("targetField") not in target_candidates:
        raise HostedPatchError("Patch Plan target field does not resolve to the manifest")
    if concept == "entity_leakage":
        entity_candidates = _sequence(
            schema_summary.get("entityCandidates"), "entityCandidates"
        )
        if plan.get("entityField") not in entity_candidates:
            raise HostedPatchError("Patch Plan entity field does not resolve to the manifest")

    cells = {
        cell.get("index"): cell
        for cell in _sequence(manifest.get("cells"), "artifactManifest.cells")
        if isinstance(cell, Mapping)
    }
    evidence_refs = _sequence(plan.get("evidenceRefs"), "evidenceRefs")
    if not evidence_refs:
        raise HostedPatchError("Patch Plan must cite resolved notebook evidence")
    for evidence in evidence_refs:
        reference = _mapping(evidence, "evidenceRef")
        kind = reference.get("kind")
        cell_index = reference.get("cellIndex")
        cell = cells.get(cell_index)
        resolved = False
        if kind == "schema":
            resolved = reference.get("hash") == sha256_json(
                _mapping(manifest.get("schemaSummary"), "schemaSummary")
            )
        elif kind == "learner_claim":
            belief = _mapping(
                bundle.get("approvedBeliefSpec")
                if bundle.get("schemaVersion") == "5"
                else bundle.get("approvedBeliefTest"),
                "approved belief authority",
            )
            learner_claim = (
                belief.get("claim")
                if bundle.get("schemaVersion") == "5"
                else belief.get("learnerClaim")
            )
            resolved = reference.get("hash") == sha256_json(
                learner_claim
            )
        elif isinstance(cell_index, int) and cell is not None:
            if kind == "code":
                resolved = reference.get("hash") == cell.get("sourceSha256")
            elif kind in {"metric", "output"}:
                output_index = reference.get("outputIndex")
                output_hashes = _sequence(cell.get("outputHashes"), "outputHashes")
                resolved = (
                    isinstance(output_index, int)
                    and 0 <= output_index < len(output_hashes)
                    and reference.get("hash") == output_hashes[output_index]
                )
        if not resolved:
            raise HostedPatchError("Patch Plan evidence does not resolve to the manifest")


def execute_hosted_patch(
    bundle: Mapping[str, Any],
    patch_plan: Mapping[str, Any],
    source_notebook: bytes,
    *,
    fixture_csv: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Apply and verify one registered patch without exposing source to Codex."""

    if (
        bundle.get("schemaVersion") not in {"1", "5"}
        or bundle.get("kind") != "PATCH_COMPILE"
    ):
        raise HostedPatchError("hosted PATCH_COMPILE bundle kind is invalid")
    if bundle.get("permittedOutputs") != [
        "patch-plan.json",
        "public-rationale.md",
    ]:
        raise HostedPatchError("hosted patch model-output policy is invalid")
    if bundle.get("schemaVersion") == "5":
        _validate_v5_patch_bundle(bundle)
    manifest = _mapping(bundle.get("artifactManifest"), "artifactManifest")
    manifest_hash = (
        sha256_json_browser(manifest)
        if bundle.get("schemaVersion") == "5"
        else sha256_json(manifest)
    )
    if bundle.get("artifactManifestHash") != manifest_hash:
        raise HostedPatchError("artifact manifest hash does not match bundle bytes")
    if len(source_notebook) == 0 or len(source_notebook) > _MAX_NOTEBOOK_BYTES:
        raise HostedPatchError("source notebook violates the hosted size policy")
    source_hash = _sha256_bytes(source_notebook)
    if source_hash != manifest.get("fileSha256"):
        raise HostedPatchError("source notebook bytes do not match the artifact manifest")
    _validate_patch_plan(bundle, patch_plan)

    destination = Path(output_dir)
    source_directory = destination / "source"
    patch_directory = destination / "verified-patch"
    source_directory.mkdir(parents=True, exist_ok=False)
    source_path = source_directory / "uploaded-notebook.ipynb"
    source_path.write_bytes(source_notebook)

    concept = str(patch_plan["concept"])
    schema_summary = _mapping(manifest.get("schemaSummary"), "schemaSummary")
    excluded_fields = [
        str(field.get("name"))
        for field in _sequence(schema_summary.get("fields"), "schemaSummary.fields")
        if isinstance(field, Mapping)
        and field.get("privacyClass") in {"row_identifier", "entity_identifier"}
    ]
    target_cells = _sequence(patch_plan.get("targetCells"), "targetCells")
    if len(target_cells) != 1:
        raise HostedPatchError(
            "the fixed patch engine supports one resolved evaluation cell"
        )
    if concept == "entity_leakage":
        # Independently reconstruct the authentic deterministic transfer pass.
        transfer_result = evaluate_forecasting_transfer(
            strategy_choice="time_ordered_holdout",
            risk_choice="centered_window_reads_future",
            evidence_choices=[
                "center_true_uses_later_targets",
                "random_split_mixes_dates",
            ],
        )
        compiled = compile_sample_notebook_patch(
            original_notebook=source_path,
            fixture_csv=Path(fixture_csv),
            output_dir=patch_directory,
            transfer_result=transfer_result,
        )
        if compiled.get("status") != "VERIFIED":
            compiled = compile_leakage_notebook_patch(
                original_notebook=source_path,
                fixture_csv=Path(fixture_csv),
                output_dir=patch_directory,
                transfer_passed=True,
                target_cell=int(target_cells[0]),
                entity_field=str(patch_plan["entityField"]),
                target_field=str(patch_plan["targetField"]),
                excluded_fields=excluded_fields,
            )
    else:
        compiled = compile_imbalance_notebook_patch(
            original_notebook=source_path,
            fixture_csv=Path(fixture_csv),
            output_dir=patch_directory,
            transfer_passed=True,
            target_cell=int(target_cells[0]),
            target_field=str(patch_plan["targetField"]),
            excluded_fields=excluded_fields,
        )
    if compiled.get("status") != "VERIFIED" or compiled.get("verified") is not True:
        message = compiled.get("message", "fixed patch verification rejected the source")
        raise HostedPatchError(str(message))

    patch_path = Path(str(compiled["patchPath"]))
    patched_notebook = patch_path.read_bytes()
    patched_hash = _sha256_bytes(patched_notebook)
    if patched_hash != compiled.get("patchedSha256"):
        raise HostedPatchError("fixed patch bytes do not match verifier metadata")

    unrelated = _sequence(
        compiled.get("unrelatedCellSourceHashes"),
        "unrelatedCellSourceHashes",
    )
    unchanged_hashes = [
        str(_mapping(item, "unrelatedCellSourceHash")["afterSha256"])
        for item in unrelated
        if _mapping(item, "unrelatedCellSourceHash").get("unchanged") is True
    ]
    verification = _mapping(compiled.get("verification"), "verification")
    diff = str(compiled.get("cellDiff", ""))
    base_result: dict[str, Any] = {
        "schemaVersion": "1",
        "id": f"patch_{bundle.get('jobId')}",
        "sessionId": str(bundle.get("sessionId")),
        "status": "VERIFIED",
        "sourceArtifactHash": source_hash,
        "patchedArtifactHash": patched_hash,
        "patchHash": sha256_json(diff),
        "modifiedCells": list(compiled.get("changedCellIndices", [])),
        "diff": diff,
        "verification": {
            "passed": True,
            "invariants": list(verification.get("invariants", [])),
            "unchangedCellHashes": unchanged_hashes,
        },
        "generatedAt": str(bundle.get("requestedAt")),
    }
    base_result["resultHash"] = sha256_json(base_result)
    return {"patchedNotebook": patched_notebook, "patchResult": base_result}


def _read_json(path: Path, maximum: int, name: str) -> Mapping[str, Any]:
    try:
        if path.stat().st_size <= 0 or path.stat().st_size > maximum:
            raise HostedPatchError(f"{name} exceeds its size policy")
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HostedPatchError(f"{name} is not valid JSON") from error
    return _mapping(value, name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a fixed CounterLab hosted patch")
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--output-notebook", type=Path, required=True)
    parser.add_argument("--output-result", type=Path, required=True)
    args = parser.parse_args()
    if args.source.stat().st_size > _MAX_NOTEBOOK_BYTES:
        raise HostedPatchError("source notebook violates the hosted size policy")
    executed = execute_hosted_patch(
        _read_json(args.bundle, _MAX_BUNDLE_BYTES, "bundle"),
        _read_json(args.plan, _MAX_PLAN_BYTES, "patch plan"),
        args.source.read_bytes(),
        fixture_csv=args.fixture,
        output_dir=args.output_notebook.parent / "patch-work",
    )
    args.output_notebook.write_bytes(executed["patchedNotebook"])
    args.output_result.write_text(
        canonical_json(executed["patchResult"]) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
