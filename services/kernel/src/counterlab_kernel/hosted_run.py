"""Artifact-bound entrypoint for hosted fixed-kernel lab jobs."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .canonical import canonical_json, sha256_json
from .fixture import generate_leakage_fixture
from .plan import ExperimentPlanValidationError, interpret_experiment_plan


_MAX_BUNDLE_BYTES = 2 * 1024 * 1024
_BUNDLE_KEYS = frozenset(
    {
        "schemaVersion",
        "kind",
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


class HostedLabRunError(ValueError):
    """Raised before fixed execution when hosted job lineage is invalid."""


def _mapping(value: object, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise HostedLabRunError(f"{name} must be an object")
    return value


def execute_hosted_lab_run(bundle: Mapping[str, Any]) -> dict[str, Any]:
    """Validate one scoped LAB_RUN bundle and execute fixed registered operations."""

    extra = sorted(set(bundle).difference(_BUNDLE_KEYS))
    missing = sorted(_BUNDLE_KEYS.difference(bundle))
    if extra or missing:
        raise HostedLabRunError(
            f"hosted LAB_RUN bundle fields are invalid: missing={missing}, extra={extra}"
        )
    if bundle.get("schemaVersion") != "1" or bundle.get("kind") != "LAB_RUN":
        raise HostedLabRunError("hosted LAB_RUN bundle kind is invalid")
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
    if plan.get("concept") != "entity_leakage":
        raise HostedLabRunError("no hosted fixed runner is registered for this concept")
    if fixture.get("id") != "public-leakage-v1":
        raise HostedLabRunError("fixture is not registered for entity leakage")
    learner_claim = bundle.get("learnerClaim")
    if not isinstance(learner_claim, str) or not learner_claim.strip():
        raise HostedLabRunError("learner claim is required")

    try:
        return interpret_experiment_plan(
            plan,
            manifest,
            generate_leakage_fixture(),
            learner_claim=learner_claim,
        )
    except ExperimentPlanValidationError as error:
        raise HostedLabRunError(str(error)) from error


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
