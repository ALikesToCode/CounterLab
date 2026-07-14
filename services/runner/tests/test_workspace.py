from __future__ import annotations

import json
from pathlib import Path
import shutil

import pytest

from counterlab_runner.workspace import (
    GENERATED_FILE_NAMES,
    WorkspacePolicyError,
    create_fresh_workspace,
    validate_generated_workspace,
)


def _write_valid_workspace(workspace: Path) -> None:
    plan = {
        "schemaVersion": "1",
        "concept": "entity_leakage",
        "datasetAdapter": "customer_churn_v1",
        "competingHypotheses": [
            "The row split generalizes.",
            "Customer overlap creates a shortcut.",
        ],
        "expectedDiscrimination": [
            {
                "runId": "random_row_split",
                "expectedUnderCurrent": "Accuracy remains high.",
                "expectedUnderCompeting": "Accuracy is inflated.",
            },
            {
                "runId": "customer_group_split",
                "expectedUnderCurrent": "Accuracy remains high.",
                "expectedUnderCompeting": "Accuracy falls.",
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
    (workspace / "experiment-plan.json").write_text(
        json.dumps(plan), encoding="utf-8"
    )
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
    (workspace / "public_tests.py").write_text(
        "from artifact_adapter import build_experiment\nassert len(build_experiment().runs) == 3\n",
        encoding="utf-8",
    )


def test_fresh_workspace_is_a_direct_contained_child(tmp_path: Path) -> None:
    generated_root = tmp_path / "generated"

    workspace = create_fresh_workspace(generated_root, "session-01")

    assert workspace.parent == generated_root.resolve()
    assert workspace.is_dir()
    with pytest.raises(WorkspacePolicyError, match="workspace_not_fresh"):
        create_fresh_workspace(generated_root, "session-01")


@pytest.mark.parametrize("session_id", ["../escape", "/absolute", "a/b", "", "."])
def test_fresh_workspace_rejects_unsafe_session_ids(
    tmp_path: Path, session_id: str
) -> None:
    with pytest.raises(WorkspacePolicyError, match="invalid_session_id"):
        create_fresh_workspace(tmp_path / "generated", session_id)


def test_workspace_rejects_symlink_escape(tmp_path: Path) -> None:
    generated_root = tmp_path / "generated"
    outside = tmp_path / "outside"
    generated_root.mkdir()
    outside.mkdir()
    (generated_root / "session-01").symlink_to(outside, target_is_directory=True)

    with pytest.raises(WorkspacePolicyError, match="workspace_symlink"):
        validate_generated_workspace(generated_root / "session-01", generated_root)


def test_workspace_requires_exact_three_regular_files(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    (workspace / "notes.txt").write_text("extra", encoding="utf-8")

    with pytest.raises(WorkspacePolicyError, match="generated_file_set") as exc:
        validate_generated_workspace(workspace, tmp_path / "generated")

    assert set(exc.value.details["expected"]) == GENERATED_FILE_NAMES
    assert exc.value.details["extra"] == ["notes.txt"]


def test_workspace_rejects_symlinked_generated_file(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    (workspace / "public_tests.py").unlink()
    target = tmp_path / "outside.py"
    target.write_text("pass\n", encoding="utf-8")
    (workspace / "public_tests.py").symlink_to(target)

    with pytest.raises(WorkspacePolicyError, match="generated_file_type"):
        validate_generated_workspace(workspace, tmp_path / "generated")


def test_workspace_runs_existing_adapter_ast_policy_without_echoing_source(
    tmp_path: Path,
) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    secret_source = "import os\nsecret = 'do-not-echo'\n"
    (workspace / "artifact-adapter.py").write_text(secret_source, encoding="utf-8")

    with pytest.raises(WorkspacePolicyError, match="adapter_ast_policy") as exc:
        validate_generated_workspace(workspace, tmp_path / "generated")

    assert exc.value.details == {"violations": ["deny_import:os"]}
    assert "do-not-echo" not in str(exc.value)


def test_valid_workspace_returns_bounded_artifacts(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)

    artifacts = validate_generated_workspace(workspace, tmp_path / "generated")

    assert artifacts.root == workspace.resolve()
    assert artifacts.plan["concept"] == "entity_leakage"
    assert artifacts.limits.max_repairs == 2


def test_plan_rejects_undeclared_fields(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    plan_path = workspace / "experiment-plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["hiddenVerifierPath"] = "/private/verifier.py"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    with pytest.raises(WorkspacePolicyError, match="experiment_plan_schema"):
        validate_generated_workspace(workspace, tmp_path / "generated")


def test_plan_requires_observably_different_predictions(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    plan_path = workspace / "experiment-plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["expectedDiscrimination"][0]["expectedUnderCompeting"] = plan[
        "expectedDiscrimination"
    ][0]["expectedUnderCurrent"]
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    with pytest.raises(
        WorkspacePolicyError, match="experiment_plan_discrimination"
    ):
        validate_generated_workspace(workspace, tmp_path / "generated")


def test_committed_public_sample_is_a_valid_generated_workspace(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[3]
    public = root / "concept-packs/leakage/public"
    workspace = create_fresh_workspace(tmp_path / "generated", "sample")
    shutil.copy2(
        public / "sample-experiment-plan.json", workspace / "experiment-plan.json"
    )
    shutil.copy2(
        public / "artifact-adapter.template.py", workspace / "artifact-adapter.py"
    )
    shutil.copy2(public / "public_tests.template.py", workspace / "public_tests.py")

    artifacts = validate_generated_workspace(workspace, tmp_path / "generated")

    assert artifacts.plan["datasetAdapter"] == "customer_churn_v1"


def test_plan_rejects_undeclared_run_changes_before_execution(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    plan_path = workspace / "experiment-plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["runs"][1]["dropFeatures"] = ["customer_id"]
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    with pytest.raises(WorkspacePolicyError, match="experiment_plan_runs"):
        validate_generated_workspace(workspace, tmp_path / "generated")


def test_plan_requires_one_seed_across_controlled_runs(tmp_path: Path) -> None:
    workspace = create_fresh_workspace(tmp_path / "generated", "session-01")
    _write_valid_workspace(workspace)
    plan_path = workspace / "experiment-plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["runs"][2]["seed"] = 1730
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    with pytest.raises(WorkspacePolicyError, match="experiment_plan_runs"):
        validate_generated_workspace(workspace, tmp_path / "generated")
