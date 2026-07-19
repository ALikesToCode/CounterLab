#!/usr/bin/env python3
"""Produce bounded reachability evidence for CPython's incremental HTML parser.

This probe is intentionally narrow. It does not claim that CPython or the
stdlib ``html`` package is globally unaffected. It proves that the exact fixed
CounterLab hosted run and patch entrypoints complete while an import guard
rejects ``html.parser`` and that the installed kernel source has no direct
reference to the vulnerable parser.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib
import importlib.abc
import importlib.util
import json
import platform
import re
import sys
import tempfile
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


_VULNERABLE_MODULE = "html.parser"
_EXPECTED_RUN_CONCEPTS = ("class_imbalance", "entity_leakage")
_EXPECTED_PATCH_CONCEPTS = ("class_imbalance", "entity_leakage")
_EXPECTED_LEAKAGE_OPERATIONS = {
    "leakage.random_row_split",
    "leakage.group_holdout",
    "leakage.identity_ablation",
}
_EXPECTED_IMBALANCE_OPERATIONS = {
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
}
_EXPECTED_PATCH_OPERATIONS = {
    "entity_leakage": {
        "replace_row_split_with_group_holdout",
        "exclude_entity_feature",
    },
    "class_imbalance": {
        "stratify_classification_holdout",
        "add_majority_baseline",
        "replace_accuracy_only_evaluation",
    },
}
_REVIEW_KEYS = {
    "schemaVersion",
    "vulnerabilityId",
    "imageDigest",
    "sourceCommit",
    "sbomSha256",
    "owner",
    "reviewedAt",
    "expiresAt",
    "kevStatus",
    "kevCheckedAt",
    "kevSource",
    "kevCatalogVersion",
    "kevCatalogCount",
    "kevDateReleased",
    "kevCatalogSha256",
}


class ForbiddenHtmlParserImport(ImportError):
    """Raised when a bounded authoritative path reaches ``html.parser``."""


class HtmlParserImportGuard(importlib.abc.MetaPathFinder):
    def __init__(self) -> None:
        self.attempts: list[str] = []

    def find_spec(
        self,
        fullname: str,
        path: Sequence[str] | None,
        target: object | None = None,
    ) -> None:
        del path, target
        if fullname == _VULNERABLE_MODULE or fullname.startswith(
            f"{_VULNERABLE_MODULE}."
        ):
            self.attempts.append(fullname)
            raise ForbiddenHtmlParserImport(
                f"bounded execution attempted to import {fullname}"
            )
        return None


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _kernel_root() -> Path:
    spec = importlib.util.find_spec("counterlab_kernel")
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError("counterlab_kernel is not installed")
    roots = [Path(value).resolve() for value in spec.submodule_search_locations]
    if len(roots) != 1:
        raise RuntimeError("counterlab_kernel must resolve to one installed root")
    return roots[0]


def scan_kernel_source(kernel_root: Path) -> list[str]:
    """Return direct vulnerable-parser references in installed kernel source."""

    violations: list[str] = []
    for path in sorted(kernel_root.rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == _VULNERABLE_MODULE or alias.name.startswith(
                        f"{_VULNERABLE_MODULE}."
                    ):
                        violations.append(f"{path.name}:{node.lineno}:import")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                imports_parser_from_html = module == "html" and any(
                    alias.name == "parser" for alias in node.names
                )
                if (
                    module == _VULNERABLE_MODULE
                    or module.startswith(f"{_VULNERABLE_MODULE}.")
                    or imports_parser_from_html
                ):
                    violations.append(f"{path.name}:{node.lineno}:from-import")
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                if _VULNERABLE_MODULE in node.value or "HTMLParser" in node.value:
                    violations.append(f"{path.name}:{node.lineno}:dynamic-reference")
    return sorted(set(violations))


def _assert_operation_registry() -> None:
    from counterlab_kernel.hosted_patch import _PATCH_OPERATIONS
    from counterlab_kernel.imbalance import REQUIRED_OPERATIONS
    from counterlab_kernel.plan import SCHEMA_PATH

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    alternatives = schema["properties"]["baseline"]["oneOf"]
    schema_operations = {
        alternative["properties"]["concept"].get("const"): set(
            alternative["properties"]["operation"]["enum"]
        )
        for alternative in alternatives
    }
    if schema_operations.get("entity_leakage") != _EXPECTED_LEAKAGE_OPERATIONS:
        raise RuntimeError("leakage operation registry drifted beyond probe coverage")
    if set(REQUIRED_OPERATIONS) != _EXPECTED_IMBALANCE_OPERATIONS:
        raise RuntimeError("imbalance operation registry drifted beyond probe coverage")
    observed_patch = {
        concept: set(operations) for concept, operations in _PATCH_OPERATIONS.items()
    }
    if observed_patch != _EXPECTED_PATCH_OPERATIONS:
        raise RuntimeError("patch operation registry drifted beyond probe coverage")


def _lab_manifest(concept: str) -> dict[str, Any]:
    if concept == "entity_leakage":
        output_hash = "b" * 64
        return {
            "artifactId": "artifact_probe_leakage",
            "fileName": "probe-leakage.ipynb",
            "fileSha256": "a" * 64,
            "nbformat": 4,
            "support": {"status": "SUPPORTED", "reasons": []},
            "cells": [
                {
                    "index": 3,
                    "type": "code",
                    "sourceSha256": "c" * 64,
                    "sourceExcerpt": "train_test_split(X, y)",
                    "executionCount": 4,
                    "outputHashes": [output_hash],
                    "symbols": ["train_test_split", "accuracy_score"],
                    "metricCandidates": [
                        {"name": "accuracy", "value": 0.98, "outputIndex": 0}
                    ],
                }
            ],
            "schemaSummary": {
                "fields": [
                    {
                        "name": "customer_id",
                        "inferredType": "categorical",
                        "privacyClass": "entity_identifier",
                    }
                ],
                "rowCount": 2880,
                "entityCandidates": ["customer_id"],
                "targetCandidates": ["churned"],
            },
            "packageHints": ["sklearn"],
            "createdAt": "2026-07-16T00:00:00.000Z",
        }
    output_hash = "d" * 64
    return {
        "artifactId": "artifact_probe_imbalance",
        "fileName": "probe-imbalance.ipynb",
        "fileSha256": "e" * 64,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 4,
                "type": "code",
                "sourceSha256": "f" * 64,
                "sourceExcerpt": "print(accuracy_score(y_test, predictions))",
                "executionCount": 5,
                "outputHashes": [output_hash],
                "symbols": ["accuracy_score", "train_test_split"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.97, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": {
            "fields": [
                {
                    "name": "fraud",
                    "inferredType": "integer",
                    "privacyClass": "target",
                }
            ],
            "rowCount": 6000,
            "entityCandidates": [],
            "targetCandidates": ["fraud"],
        },
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-16T00:00:00.000Z",
    }


def _lab_plan(concept: str, manifest: Mapping[str, Any]) -> dict[str, Any]:
    from counterlab_kernel.canonical import sha256_json

    if concept == "entity_leakage":
        run = lambda run_id, operation, drop: {
            "concept": concept,
            "runId": run_id,
            "operation": operation,
            "seed": 1729,
            "testFraction": 0.25,
            "entityField": "customer_id",
            "dropIdentity": drop,
            "model": "logistic_regression",
        }
        baseline = run("random_rows", "leakage.random_row_split", False)
        interventions = [
            run("new_customers", "leakage.group_holdout", False),
            run("without_identity", "leakage.identity_ablation", True),
        ]
        metrics = ["accuracy", "roc_auc", "entity_overlap_rate"]
        visualizations = ["metric_comparison", "entity_overlap"]
        claim = "The notebook accuracy proves generalization to new customers."
    else:
        def run(
            run_id: str,
            operation: str,
            model: str,
            threshold: float,
            prevalence: str,
        ) -> dict[str, Any]:
            return {
                "concept": concept,
                "runId": run_id,
                "operation": operation,
                "seed": 2603,
                "threshold": threshold,
                "prevalenceScenario": prevalence,
                "model": model,
            }

        baseline = run(
            "accuracy_only",
            "imbalance.majority_baseline",
            "majority_baseline",
            0.5,
            "observed",
        )
        interventions = [
            run(
                "minority_metrics",
                "imbalance.stratified_holdout",
                "logistic_regression",
                0.5,
                "observed",
            ),
            run(
                "lower_threshold",
                "imbalance.threshold_sweep",
                "logistic_regression",
                0.25,
                "observed",
            ),
            run(
                "rarer_deployment",
                "imbalance.prevalence_sweep",
                "logistic_regression",
                0.25,
                "rarer",
            ),
        ]
        metrics = [
            "accuracy",
            "precision",
            "recall",
            "f1",
            "pr_auc",
            "roc_auc",
            "confusion_matrix",
            "prevalence",
        ]
        visualizations = [
            "metric_comparison",
            "confusion_matrix",
            "threshold_curve",
            "prevalence_sensitivity",
        ]
        claim = "The accuracy proves this detector catches rare fraud."
    cell = manifest["cells"][0]
    output_hash = cell["outputHashes"][0]
    plan = {
        "schemaVersion": "2",
        "planId": f"plan_probe_{concept}",
        "sessionId": f"session_probe_{concept}",
        "concept": concept,
        "conceptPackVersion": "2.0.0" if concept == "entity_leakage" else "1.0.0",
        "artifactManifestHash": sha256_json(manifest),
        "beliefTestId": f"belief_probe_{concept}",
        "evidenceRefs": [
            {
                "cellIndex": cell["index"],
                "outputIndex": 0,
                "kind": "metric",
                "hash": output_hash,
                "excerpt": "reported accuracy",
                "relevance": "The reported metric is the claim's evidence.",
            }
        ],
        "baseline": baseline,
        "interventions": interventions,
        "controlledVariables": ["fixture", "model", "seed"],
        "changedVariables": ["evaluation condition"],
        "metrics": metrics,
        "visualizations": visualizations,
        "discriminatesBecause": "The fixed intervention separates the hypotheses.",
        "expectedPatterns": [
            {
                "hypothesisId": "current",
                "qualitativeOutcome": "The reported pattern persists.",
            },
            {
                "hypothesisId": "competing",
                "qualitativeOutcome": "The reported pattern changes.",
            },
        ],
        "nonClaims": ["This does not prove performance in every population."],
        "resourceLimits": {"wallSeconds": 30, "memoryMb": 512, "maxRuns": 4},
    }
    return {"claim": claim, "plan": plan}


def _execute_lab(concept: str) -> str:
    from counterlab_kernel.canonical import sha256_json
    from counterlab_kernel.hosted_run import execute_hosted_lab_run

    manifest = _lab_manifest(concept)
    built = _lab_plan(concept, manifest)
    plan = built["plan"]
    bundle = {
        "schemaVersion": "1",
        "kind": "LAB_RUN",
        "purpose": "AUTHORITATIVE",
        "jobId": f"job_probe_{concept}",
        "sessionId": plan["sessionId"],
        "stateVersion": 1,
        "artifactManifestHash": sha256_json(manifest),
        "artifactManifest": manifest,
        "learnerClaim": built["claim"],
        "experimentPlan": plan,
        "experimentPlanHash": sha256_json(plan),
        "fixture": {
            "id": (
                "public-leakage-v1"
                if concept == "entity_leakage"
                else "public-imbalance-v1"
            )
        },
        "permittedOutputs": ["verified-result.json"],
    }
    result = execute_hosted_lab_run(bundle)
    return str(result["resultHash"])


def _patch_inputs(root: Path, concept: str) -> tuple[dict[str, Any], dict[str, Any], bytes, Path]:
    import nbformat

    from counterlab_kernel.canonical import sha256_json

    notebook_path = root / "fixtures" / "notebooks" / (
        "customer_churn_leakage.ipynb"
        if concept == "entity_leakage"
        else "fraud_class_imbalance.ipynb"
    )
    fixture_path = root / "fixtures" / "public" / (
        "customer_churn.csv"
        if concept == "entity_leakage"
        else "fraud_rare_event.csv"
    )
    source = notebook_path.read_bytes()
    notebook = nbformat.reads(source.decode("utf-8"), as_version=4)
    evaluation_source = str(notebook.cells[3].source)
    source_hash = _sha256_bytes(source)
    evidence_hash = _sha256_bytes(evaluation_source.encode())
    target = "churned" if concept == "entity_leakage" else "fraud"
    fields = [
        {
            "name": "customer_id" if concept == "entity_leakage" else "case_id",
            "inferredType": "categorical",
            "privacyClass": (
                "entity_identifier" if concept == "entity_leakage" else "row_identifier"
            ),
        },
        {
            "name": target,
            "inferredType": "binary",
            "privacyClass": "target",
        },
    ]
    manifest = {
        "artifactId": f"artifact_probe_patch_{concept}",
        "fileName": notebook_path.name,
        "fileSha256": source_hash,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 3,
                "type": "code",
                "sourceSha256": evidence_hash,
                "sourceExcerpt": evaluation_source[:240],
                "executionCount": 4,
                "outputHashes": ["a" * 64],
                "symbols": ["train_test_split", "accuracy_score"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.98, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": {
            "fields": fields,
            "rowCount": 2880 if concept == "entity_leakage" else 6000,
            "entityCandidates": ["customer_id"] if concept == "entity_leakage" else [],
            "targetCandidates": [target],
        },
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-16T00:00:00.000Z",
    }
    manifest_hash = sha256_json(manifest)
    operations = (
        [
            {
                "id": "replace_row_split_with_group_holdout",
                "cellIndex": 3,
                "reason": "Hold out complete customers.",
            },
            {
                "id": "exclude_entity_feature",
                "cellIndex": 3,
                "reason": "Remove the identity shortcut.",
            },
        ]
        if concept == "entity_leakage"
        else [
            {
                "id": "stratify_classification_holdout",
                "cellIndex": 3,
                "reason": "Preserve rare-class prevalence.",
            },
            {
                "id": "add_majority_baseline",
                "cellIndex": 3,
                "reason": "Compute the trivial reference.",
            },
            {
                "id": "replace_accuracy_only_evaluation",
                "cellIndex": 3,
                "reason": "Report minority-sensitive metrics.",
            },
        ]
    )
    plan: dict[str, Any] = {
        "schemaVersion": "1",
        "planId": f"patch_plan_probe_{concept}",
        "sessionId": f"session_probe_patch_{concept}",
        "concept": concept,
        "conceptPackVersion": "2.0.0" if concept == "entity_leakage" else "1.0.0",
        "artifactManifestHash": manifest_hash,
        "sourceArtifactHash": source_hash,
        "transferResultHash": "b" * 64,
        "verifiedResultHash": "c" * 64,
        "evidenceRefs": [
            {
                "cellIndex": 3,
                "kind": "code",
                "hash": evidence_hash,
                "excerpt": "train_test_split",
                "relevance": "This cell defines evaluation.",
            }
        ],
        "targetCells": [3],
        "targetField": target,
        "operations": operations,
        "preserveUnrelatedCells": True,
        "nonClaims": ["This does not prove production performance."],
    }
    if concept == "entity_leakage":
        plan["entityField"] = "customer_id"
    bundle = {
        "schemaVersion": "1",
        "kind": "PATCH_COMPILE",
        "jobId": f"job_probe_patch_{concept}",
        "sessionId": plan["sessionId"],
        "stateVersion": 1,
        "requestedAt": "2026-07-16T00:00:00.000Z",
        "artifactManifestHash": manifest_hash,
        "artifactManifest": manifest,
        "approvedBeliefTest": {
            "concept": concept,
            "learnerClaim": "Probe claim",
        },
        "verifiedResultSummary": {
            "schemaVersion": "2",
            "resultHash": "c" * 64,
            "planId": f"plan_probe_{concept}",
            "runIds": [],
        },
        "transferSummary": {
            "outcome": "PASSED",
            "resultHash": "b" * 64,
            "selectedStrategy": "verified_fixed_transfer",
            "identifiedRisks": ["evaluation_mismatch"],
        },
        "patchContract": {"id": f"{concept}-patch-contract"},
        "allowedCellIndices": [3],
        "patchPlanSchema": {"type": "object"},
        "permittedOutputs": ["patch-plan.json", "public-rationale.md"],
    }
    return bundle, plan, source, fixture_path


def _execute_patch(root: Path, concept: str, output_dir: Path) -> str:
    from counterlab_kernel.hosted_patch import execute_hosted_patch

    bundle, plan, source, fixture_path = _patch_inputs(root, concept)
    executed = execute_hosted_patch(
        bundle,
        plan,
        source,
        fixture_csv=fixture_path,
        output_dir=output_dir,
    )
    return str(executed["patchResult"]["resultHash"])


def run_probe(root: Path) -> dict[str, Any]:
    kernel_root = _kernel_root()
    violations = scan_kernel_source(kernel_root)
    if violations:
        raise RuntimeError(
            f"installed kernel references {_VULNERABLE_MODULE}: {violations}"
        )

    if _VULNERABLE_MODULE in sys.modules:
        raise RuntimeError("html.parser was loaded before the reachability guard")
    guard = HtmlParserImportGuard()
    sys.meta_path.insert(0, guard)
    negative_control = "FAILED"
    try:
        try:
            importlib.import_module(_VULNERABLE_MODULE)
        except ForbiddenHtmlParserImport:
            negative_control = "PASSED"
        if negative_control != "PASSED":
            raise RuntimeError("html.parser negative control did not trigger the guard")

        _assert_operation_registry()
        outputs = [
            _execute_lab("entity_leakage"),
            _execute_lab("class_imbalance"),
        ]
        with tempfile.TemporaryDirectory(prefix="counterlab-reachability-") as temporary:
            output_root = Path(temporary)
            outputs.extend(
                [
                    _execute_patch(
                        root,
                        "entity_leakage",
                        output_root / "leakage-patch",
                    ),
                    _execute_patch(
                        root,
                        "class_imbalance",
                        output_root / "imbalance-patch",
                    ),
                ]
            )
    finally:
        sys.meta_path.remove(guard)

    if _VULNERABLE_MODULE in sys.modules:
        raise RuntimeError("html.parser was loaded during bounded execution")
    if guard.attempts != [_VULNERABLE_MODULE]:
        raise RuntimeError("html.parser guard observed an unexpected import attempt")
    if len(set(outputs)) != 4:
        raise RuntimeError("bounded path outputs are incomplete or unexpectedly aliased")

    module_path = Path(platform.__file__).resolve().parent / "html" / "parser.py"
    if not module_path.is_file():
        module_path = Path(sys.base_prefix) / "lib" / (
            f"python{sys.version_info.major}.{sys.version_info.minor}"
        ) / "html" / "parser.py"
    if not module_path.is_file():
        raise RuntimeError("installed html/parser.py could not be located")
    return {
        "staticAstScan": "PASSED",
        "importGuard": "PASSED",
        "negativeControl": negative_control,
        "forbiddenModuleLoaded": False,
        "hostedRunConcepts": list(_EXPECTED_RUN_CONCEPTS),
        "hostedPatchConcepts": list(_EXPECTED_PATCH_CONCEPTS),
        "outputHashes": sorted(outputs),
        "modulePath": str(module_path),
        "moduleSha256": _sha256_file(module_path),
    }


def _review_input(args: argparse.Namespace) -> dict[str, Any]:
    root = args.root.resolve(strict=True)
    requested_review_path = args.review_file
    if not requested_review_path.is_absolute():
        requested_review_path = root / requested_review_path
    if requested_review_path.is_symlink():
        raise RuntimeError("reachability review must not be a symlink")
    review_path = requested_review_path.resolve(strict=True)
    if root != review_path and root not in review_path.parents:
        raise RuntimeError("reachability review file escaped the repository")
    if not review_path.is_file():
        raise RuntimeError("reachability review must be a regular repository file")
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if not isinstance(review, dict) or set(review) != _REVIEW_KEYS:
        raise RuntimeError("reachability review contains missing or unknown fields")
    expected = {
        "schemaVersion": "2",
        "vulnerabilityId": "CVE-2026-15308",
        "imageDigest": args.image_digest,
        "sourceCommit": args.source_commit,
        "sbomSha256": args.sbom_sha256,
        "owner": "counterlab-release-owner",
        "kevStatus": "NOT_LISTED",
        "kevSource": (
            "https://www.cisa.gov/sites/default/files/feeds/"
            "known_exploited_vulnerabilities.json"
        ),
    }
    for key, value in expected.items():
        if review.get(key) != value:
            raise RuntimeError(f"reachability review {key} is not source-bound")
    for key in (
        "reviewedAt",
        "expiresAt",
        "kevCheckedAt",
        "kevCatalogVersion",
        "kevDateReleased",
        "kevCatalogSha256",
    ):
        value = review.get(key)
        if not isinstance(value, str) or not value:
            raise RuntimeError(f"reachability review {key} is invalid")
    if len(review["kevCatalogSha256"]) != 64 or any(
        character not in "0123456789abcdef"
        for character in review["kevCatalogSha256"]
    ):
        raise RuntimeError("reachability review KEV hash is invalid")
    if not re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", review["kevCatalogVersion"]):
        raise RuntimeError("reachability review KEV version is invalid")
    if not isinstance(review["kevCatalogCount"], int) or review["kevCatalogCount"] < 1_000:
        raise RuntimeError("reachability review KEV count is invalid")
    try:
        reviewed_at = datetime.fromisoformat(review["reviewedAt"].replace("Z", "+00:00"))
        expires_at = datetime.fromisoformat(review["expiresAt"].replace("Z", "+00:00"))
        kev_checked_at = datetime.fromisoformat(
            review["kevCheckedAt"].replace("Z", "+00:00")
        )
        kev_date_released = datetime.fromisoformat(
            review["kevDateReleased"].replace("Z", "+00:00")
        )
    except ValueError as error:
        raise RuntimeError("reachability review timestamp is invalid") from error
    if (
        reviewed_at.tzinfo != timezone.utc
        or expires_at.tzinfo != timezone.utc
        or kev_checked_at.tzinfo != timezone.utc
        or kev_date_released.tzinfo != timezone.utc
        or expires_at != reviewed_at + timedelta(days=14)
        or kev_checked_at != reviewed_at
        or kev_date_released > kev_checked_at
        or kev_checked_at - kev_date_released > timedelta(days=14)
    ):
        raise RuntimeError("reachability review timestamps are not bounded")
    return review


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    review = _review_input(args)
    probe = run_probe(args.root.resolve())
    return {
        "schemaVersion": "2",
        "evidenceKind": "reachability-report",
        "vulnerabilityId": review["vulnerabilityId"],
        "imageDigest": args.image_digest,
        "sourceCommit": args.source_commit,
        "sbomSha256": args.sbom_sha256,
        "pythonVersion": platform.python_version(),
        "module": {
            "path": probe.pop("modulePath"),
            "sha256": probe.pop("moduleSha256"),
        },
        "coverage": probe,
        "review": {
            "owner": review["owner"],
            "reviewedAt": review["reviewedAt"],
            "expiresAt": review["expiresAt"],
            "kevStatus": review["kevStatus"],
            "kevCheckedAt": review["kevCheckedAt"],
            "kevSource": review["kevSource"],
            "kevCatalogVersion": review["kevCatalogVersion"],
            "kevCatalogCount": review["kevCatalogCount"],
            "kevDateReleased": review["kevDateReleased"],
            "kevCatalogSha256": review["kevCatalogSha256"],
            "revalidationTriggers": [
                "image digest changes",
                "source commit changes",
                "SBOM changes",
                "entrypoint or operation coverage changes",
                "Python or vulnerable module bytes change",
                "scanner database or vulnerability status changes",
            ],
        },
        "status": "VERIFIED",
        "limitations": [
            "This proves bounded non-reachability for the fixed hosted paths, not whole-program safety.",
            "The review expires and must be rerun when any recorded binding changes.",
        ],
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Probe bounded CounterLab paths for html.parser reachability"
    )
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--image-digest", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--sbom-sha256", required=True)
    parser.add_argument("--review-file", type=Path, required=True)
    args = parser.parse_args(argv)
    report = build_report(args)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
