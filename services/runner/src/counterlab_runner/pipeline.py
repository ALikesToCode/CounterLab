from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Protocol

import pandas as pd

from counterlab_kernel.experiment import run_leakage_experiment
from counterlab_kernel.verifier import verify_candidate

from .docker import DockerExecutionError, DockerExecutionRecord
from .orchestrator import (
    PipelineOutcome,
    StructuredCounterexample,
    sanitize_counterexamples,
)
from .workspace import (
    GeneratedWorkspace,
    WorkspacePolicyError,
    validate_generated_workspace,
)


class AdapterExecutor(Protocol):
    def execute(
        self,
        *,
        artifacts: GeneratedWorkspace,
        fixture: Path,
        run_root: Path,
    ) -> DockerExecutionRecord: ...


def _rejected(
    invariant: str,
    observed: object,
    expected: object,
    counterexample: str,
) -> PipelineOutcome:
    return PipelineOutcome.rejected(
        (
            StructuredCounterexample(
                invariant=invariant,
                observed=observed,
                expected=expected,
                counterexample=counterexample,
            ),
        )
    )


def _normalized_plan_runs(plan: dict[str, Any]) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for run in plan["runs"]:
        normalized.append(
            {
                "id": run["id"],
                "split": run["split"],
                "groupBy": run.get("groupBy"),
                "dropFeatures": run.get("dropFeatures", []),
                "model": run["model"],
                "seed": run["seed"],
            }
        )
    return normalized


def _adapter_matches_plan(plan: dict[str, Any], contract: object) -> bool:
    if not isinstance(contract, dict) or not isinstance(contract.get("runs"), list):
        return False
    expected = sorted(_normalized_plan_runs(plan), key=lambda item: str(item["id"]))
    observed = sorted(contract["runs"], key=lambda item: str(item.get("id", "")))
    return observed == expected


def _metric_signature(result: dict[str, Any]) -> tuple[tuple[float, float], ...]:
    return tuple(
        (float(run["metrics"]["accuracy"]), float(run["metrics"]["rocAuc"]))
        for run in result["runs"]
    )


def _compute_active_probes(
    frame: pd.DataFrame, reference: dict[str, Any], seed: int
) -> dict[str, object]:
    repeated = run_leakage_experiment(frame.copy(deep=True), seed=seed)
    reordered = run_leakage_experiment(
        frame.iloc[::-1].reset_index(drop=True), seed=seed
    )
    mutated = frame.copy(deep=True)
    mutated["churned"] = (
        frame["churned"].sample(frac=1.0, random_state=seed).to_numpy()
    )
    label_mutation = run_leakage_experiment(mutated, seed=seed)
    reference_signature = _metric_signature(reference)
    mutated_signature = _metric_signature(label_mutation)
    max_delta = max(
        abs(before - after)
        for before_pair, after_pair in zip(reference_signature, mutated_signature, strict=True)
        for before, after in zip(before_pair, after_pair, strict=True)
    )
    return {
        "labelMutation": {
            "metricsChanged": reference_signature != mutated_signature,
            "maxDelta": round(max_delta, 12),
        },
        "rowReordering": {
            "canonicalHashMatches": reordered["resultHash"] == reference["resultHash"]
        },
        "reproducibility": {
            "sameSeedHashMatches": repeated["resultHash"] == reference["resultHash"]
        },
    }


class HostCompileVerifyPipeline:
    """Execute declarative code, then compute and verify truth on the host."""

    def __init__(
        self,
        *,
        generated_root: Path,
        fixture_path: Path,
        executor: AdapterExecutor,
        run_root: Path,
    ) -> None:
        self._generated_root = generated_root
        self._fixture_path = fixture_path.resolve(strict=True)
        self._executor = executor
        self._run_root = run_root

    def __call__(self, workspace: Path) -> PipelineOutcome:
        try:
            artifacts = validate_generated_workspace(workspace, self._generated_root)
            execution = self._executor.execute(
                artifacts=artifacts,
                fixture=self._fixture_path,
                run_root=self._run_root,
            )
        except WorkspacePolicyError as exc:
            return _rejected(
                "generated_workspace_policy",
                {"code": exc.code, **exc.details},
                "contained exact generated workspace passing static policy",
                "The generated workspace was rejected before execution.",
            )
        except DockerExecutionError as exc:
            return _rejected(
                "candidate_execution",
                {"code": exc.code, **exc.details},
                "successful constrained adapter execution",
                "The candidate did not complete inside the constrained runner.",
            )

        if execution.exit_code != 0:
            return _rejected(
                "candidate_execution",
                {"exitCode": execution.exit_code},
                {"exitCode": 0},
                "The candidate process exited without producing a valid contract.",
            )
        if not _adapter_matches_plan(artifacts.plan, execution.adapter_contract):
            return _rejected(
                "adapter_matches_plan",
                "adapter contract differs",
                "adapter run declarations equal experiment-plan runs",
                "The executable adapter changed a declared intervention.",
            )

        evidence = execution.evidence
        mounted_targets = evidence.get("mountedTargets")
        mounts_are_public = (
            isinstance(mounted_targets, list)
            and set(mounted_targets)
            == {"/workspace", "/fixtures/customer_churn.csv", "/output"}
        )
        limits = evidence.get("limits")
        required_limits = {
            "wallSeconds",
            "memoryMb",
            "maxProcesses",
            "maxFiles",
            "maxOutputBytes",
        }
        limits_enforced = isinstance(limits, dict) and all(
            limits.get(name) is True for name in required_limits
        )
        aggregate_limits_enforced = (
            evidence.get("aggregateLimitIntentEnforced") is True
        )
        if (
            not mounts_are_public
            or not limits_enforced
            or not aggregate_limits_enforced
        ):
            return _rejected(
                "runner_enforcement",
                {
                    "publicMountsOnly": mounts_are_public,
                    "limitsEnforced": limits_enforced,
                    "aggregateLimitsEnforced": aggregate_limits_enforced,
                },
                {
                    "publicMountsOnly": True,
                    "limitsEnforced": True,
                    "aggregateLimitsEnforced": True,
                },
                "The execution record did not establish the required runner controls.",
            )

        frame = pd.read_csv(self._fixture_path)
        seed = int(artifacts.plan["runs"][0]["seed"])
        result = run_leakage_experiment(frame, seed=seed)
        candidate = copy.deepcopy(result)
        candidate["probes"] = _compute_active_probes(frame, result, seed)
        candidate["plan"] = {
            "competingHypotheses": artifacts.plan["competingHypotheses"],
            "expectedDiscrimination": artifacts.plan["expectedDiscrimination"],
        }
        candidate["resourceEnforcement"] = {
            "networkDenied": evidence.get("networkDenied") is True,
            "limits": limits,
            "limitMode": evidence.get("limitMode"),
            "aggregateLimitIntentEnforced": evidence.get(
                "aggregateLimitIntentEnforced"
            ),
            "intendedAggregateLimits": evidence.get("intendedAggregateLimits"),
            "limitAuthority": evidence.get("limitAuthority"),
            "timeoutAuthority": evidence.get("timeoutAuthority"),
        }
        candidate["isolation"] = {
            "hiddenVerifierMounted": not mounts_are_public,
            "heldOutMounted": not mounts_are_public,
            "readAttemptsDenied": evidence.get("hiddenReadAttemptsDenied") is True,
        }
        candidate["support"] = {"status": "SUPPORTED", "ambiguous": False}
        report = verify_candidate(candidate)
        if report["status"] != "VERIFIED":
            return PipelineOutcome.rejected(sanitize_counterexamples(report))
        return PipelineOutcome.verified(
            result,
            verification=report,
            execution=execution,
        )
