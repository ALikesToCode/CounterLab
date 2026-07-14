from __future__ import annotations

import json
from pathlib import Path

from counterlab_runner.docker import DockerExecutionRecord, RunnerLimits
from counterlab_runner.pipeline import HostCompileVerifyPipeline
from counterlab_runner.workspace import create_fresh_workspace


def _write_workspace(workspace: Path) -> None:
    plan = {
        "schemaVersion": "1",
        "concept": "entity_leakage",
        "datasetAdapter": "customer_churn_v1",
        "competingHypotheses": ["Row split transfers.", "Overlap inflates the result."],
        "expectedDiscrimination": [
            {
                "runId": "random_row_split",
                "expectedUnderCurrent": "High",
                "expectedUnderCompeting": "Inflated",
            },
            {
                "runId": "customer_group_split",
                "expectedUnderCurrent": "High",
                "expectedUnderCompeting": "Lower",
            },
        ],
        "runs": [
            {
                "id": "random_row_split",
                "split": "random",
                "model": "logistic_regression",
                "seed": 1729,
            },
            {
                "id": "customer_group_split",
                "split": "group",
                "groupBy": "customer_id",
                "model": "logistic_regression",
                "seed": 1729,
            },
            {
                "id": "identity_ablation",
                "split": "random",
                "dropFeatures": ["customer_id"],
                "model": "logistic_regression",
                "seed": 1729,
            },
        ],
        "metrics": ["accuracy", "roc_auc"],
        "views": ["metric_comparison", "entity_overlap"],
        "invariants": ["zero_group_overlap", "identity_feature_removed"],
        "resourceLimits": {
            "wallSeconds": 20,
            "memoryMb": 512,
            "maxProcesses": 16,
            "maxFiles": 8,
            "maxOutputBytes": 262144,
        },
    }
    (workspace / "experiment-plan.json").write_text(json.dumps(plan), encoding="utf-8")
    (workspace / "artifact-adapter.py").write_text(
        """from counterlab_sdk import Experiment, Run
def build_experiment():
    return Experiment(runs=(
        Run(id="random_row_split", split="random", seed=1729),
        Run(id="customer_group_split", split="group", group_by="customer_id", seed=1729),
        Run(id="identity_ablation", split="random", drop_features=("customer_id",), seed=1729),
    ))
""",
        encoding="utf-8",
    )
    (workspace / "public_tests.py").write_text("assert True\n", encoding="utf-8")


class _Executor:
    def __init__(self, contract: dict[str, object]) -> None:
        self.contract = contract
        self.calls = 0

    def execute(self, **_: object) -> DockerExecutionRecord:
        self.calls += 1
        return DockerExecutionRecord(
            exit_code=0,
            duration_ms=17,
            adapter_contract=self.contract,
            evidence={
                "networkDenied": True,
                "hiddenReadAttemptsDenied": True,
                "containerUser": "65532:65532",
                "mountedTargets": [
                    "/workspace",
                    "/fixtures/customer_churn.csv",
                    "/output",
                ],
                "limits": {
                    "wallSeconds": True,
                    "memoryMb": True,
                    "maxProcesses": True,
                    "maxFiles": True,
                    "maxOutputBytes": True,
                },
            },
        )


def _contract() -> dict[str, object]:
    return {
        "runs": [
            {
                "id": "random_row_split",
                "split": "random",
                "groupBy": None,
                "dropFeatures": [],
                "model": "logistic_regression",
                "seed": 1729,
            },
            {
                "id": "customer_group_split",
                "split": "group",
                "groupBy": "customer_id",
                "dropFeatures": [],
                "model": "logistic_regression",
                "seed": 1729,
            },
            {
                "id": "identity_ablation",
                "split": "random",
                "groupBy": None,
                "dropFeatures": ["customer_id"],
                "model": "logistic_regression",
                "seed": 1729,
            },
        ]
    }


def test_host_pipeline_computes_truth_and_invokes_verifier_outside_container(
    tmp_path: Path,
) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_workspace(workspace)
    executor = _Executor(_contract())
    root = Path(__file__).resolve().parents[3]
    pipeline = HostCompileVerifyPipeline(
        generated_root=tmp_path / "generated",
        fixture_path=root / "fixtures/public/customer_churn.csv",
        executor=executor,
        run_root=tmp_path / "runs",
    )

    outcome = pipeline(workspace)

    assert outcome.status == "VERIFIED"
    assert outcome.result is not None
    assert outcome.result["resultHash"] == (
        "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0"
    )
    assert outcome.verification is not None
    assert outcome.verification["status"] == "VERIFIED"
    assert "zero_group_overlap" in outcome.verification["verifiedInvariants"]
    assert outcome.execution is not None
    assert outcome.execution.exit_code == 0
    assert outcome.execution.duration_ms == 17
    assert executor.calls == 1


def test_host_pipeline_rejects_adapter_contract_that_diverges_from_plan(
    tmp_path: Path,
) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_workspace(workspace)
    contract = _contract()
    contract["runs"][1]["groupBy"] = None  # type: ignore[index]
    root = Path(__file__).resolve().parents[3]
    pipeline = HostCompileVerifyPipeline(
        generated_root=tmp_path / "generated",
        fixture_path=root / "fixtures/public/customer_churn.csv",
        executor=_Executor(contract),
        run_root=tmp_path / "runs",
    )

    outcome = pipeline(workspace)

    assert outcome.status == "REJECTED"
    assert outcome.result is None
    assert outcome.failures[0].invariant == "adapter_matches_plan"
    assert "path" not in repr(outcome.failures)


def test_host_pipeline_rejects_false_isolation_probe_without_computed_result(
    tmp_path: Path,
) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_workspace(workspace)

    class UnsafeExecutor(_Executor):
        def execute(self, **_: object) -> DockerExecutionRecord:
            return DockerExecutionRecord(
                exit_code=0,
                duration_ms=5,
                adapter_contract=self.contract,
                evidence={
                    "networkDenied": False,
                    "hiddenReadAttemptsDenied": True,
                    "containerUser": "65532:65532",
                    "mountedTargets": [
                        "/workspace",
                        "/fixtures/customer_churn.csv",
                        "/output",
                    ],
                    "limits": {
                        "wallSeconds": True,
                        "memoryMb": True,
                        "maxProcesses": True,
                        "maxFiles": True,
                        "maxOutputBytes": True,
                    },
                },
            )

    root = Path(__file__).resolve().parents[3]
    outcome = HostCompileVerifyPipeline(
        generated_root=tmp_path / "generated",
        fixture_path=root / "fixtures/public/customer_churn.csv",
        executor=UnsafeExecutor(_contract()),
        run_root=tmp_path / "runs",
    )(workspace)

    assert outcome.status == "REJECTED"
    assert outcome.result is None
    assert "network_isolation" in {failure.invariant for failure in outcome.failures}
