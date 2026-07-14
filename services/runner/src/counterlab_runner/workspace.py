from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from counterlab_kernel.policy import validate_adapter_source

from .limits import RunnerLimits


GENERATED_FILE_NAMES = frozenset(
    {"experiment-plan.json", "artifact-adapter.py", "public_tests.py"}
)
_SESSION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_MAX_PLAN_BYTES = 131_072
_MAX_SOURCE_BYTES = 262_144
_MAX_JSON_DEPTH = 12
_EXPECTED_RUNS = {
    "random_row_split": {"split": "random"},
    "customer_group_split": {"split": "group", "groupBy": "customer_id"},
    "identity_ablation": {"split": "random", "dropFeatures": ["customer_id"]},
}


class WorkspacePolicyError(ValueError):
    def __init__(self, code: str, details: dict[str, object] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class GeneratedWorkspace:
    root: Path
    plan_path: Path
    adapter_path: Path
    public_tests_path: Path
    plan: dict[str, Any]
    limits: RunnerLimits
    plan_source: str
    adapter_source: str
    public_tests_source: str


def _assert_safe_root(root: Path) -> Path:
    if root.is_symlink():
        raise WorkspacePolicyError("generated_root_symlink")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root.resolve(strict=True)


def create_fresh_workspace(generated_root: Path, session_id: str) -> Path:
    """Create one new direct child without accepting client-controlled paths."""

    if not _SESSION_ID.fullmatch(session_id) or session_id in {".", ".."}:
        raise WorkspacePolicyError("invalid_session_id")
    root = _assert_safe_root(generated_root)
    workspace = root / session_id
    if workspace.exists() or workspace.is_symlink():
        raise WorkspacePolicyError("workspace_not_fresh")
    workspace.mkdir(mode=0o700)
    resolved = workspace.resolve(strict=True)
    if resolved.parent != root:
        raise WorkspacePolicyError("workspace_containment")
    return resolved


def _json_depth(value: object, depth: int = 0) -> int:
    if depth > _MAX_JSON_DEPTH:
        return depth
    if isinstance(value, dict):
        return max((_json_depth(item, depth + 1) for item in value.values()), default=depth)
    if isinstance(value, list):
        return max((_json_depth(item, depth + 1) for item in value), default=depth)
    return depth


def _read_bounded(path: Path, maximum: int, code: str) -> str:
    size = path.stat().st_size
    if size > maximum:
        raise WorkspacePolicyError(code, {"size": size, "maximum": maximum})
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise WorkspacePolicyError(code, {"encoding": "invalid_utf8"}) from exc


def _nonempty_strings(value: object, *, minimum: int = 1) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= minimum
        and all(isinstance(item, str) and bool(item.strip()) for item in value)
    )


def _validate_plan(value: object) -> tuple[dict[str, Any], RunnerLimits]:
    if not isinstance(value, dict):
        raise WorkspacePolicyError("experiment_plan_schema")
    required = {
        "schemaVersion",
        "concept",
        "datasetAdapter",
        "competingHypotheses",
        "expectedDiscrimination",
        "runs",
        "metrics",
        "views",
        "invariants",
        "resourceLimits",
    }
    if set(value) != required:
        raise WorkspacePolicyError(
            "experiment_plan_schema",
            {
                "missing": sorted(required.difference(value)),
                "extra": sorted(set(value).difference(required)),
            },
        )
    if (
        value.get("schemaVersion") != "1"
        or value.get("concept") != "entity_leakage"
        or not isinstance(value.get("datasetAdapter"), str)
        or not _nonempty_strings(value.get("competingHypotheses"), minimum=2)
        or len(value["competingHypotheses"]) != 2
        or value["competingHypotheses"][0] == value["competingHypotheses"][1]
        or not _nonempty_strings(value.get("metrics"))
        or not _nonempty_strings(value.get("views"))
        or not _nonempty_strings(value.get("invariants"))
    ):
        raise WorkspacePolicyError("experiment_plan_schema")

    discrimination = value.get("expectedDiscrimination")
    if not isinstance(discrimination, list) or len(discrimination) < 2:
        raise WorkspacePolicyError("experiment_plan_discrimination")
    discrimination_run_ids: set[str] = set()
    discrimination_fields = {
        "runId",
        "expectedUnderCurrent",
        "expectedUnderCompeting",
    }
    for item in discrimination:
        if not isinstance(item, dict) or set(item) != discrimination_fields or not all(
            isinstance(item.get(name), str) and item[name].strip()
            for name in discrimination_fields
        ):
            raise WorkspacePolicyError("experiment_plan_discrimination")
        if item["expectedUnderCurrent"] == item["expectedUnderCompeting"]:
            raise WorkspacePolicyError("experiment_plan_discrimination")
        discrimination_run_ids.add(item["runId"])
    if len(discrimination_run_ids) < 2:
        raise WorkspacePolicyError("experiment_plan_discrimination")

    runs = value.get("runs")
    if not isinstance(runs, list) or len(runs) != 3:
        raise WorkspacePolicyError("experiment_plan_runs")
    indexed: dict[str, dict[str, Any]] = {}
    allowed_run_fields = {"id", "split", "groupBy", "dropFeatures", "model", "seed"}
    for run in runs:
        if (
            not isinstance(run, dict)
            or not isinstance(run.get("id"), str)
            or set(run).difference(allowed_run_fields)
        ):
            raise WorkspacePolicyError("experiment_plan_runs")
        indexed[run["id"]] = run
    if set(indexed) != set(_EXPECTED_RUNS) or len(indexed) != len(runs):
        raise WorkspacePolicyError("experiment_plan_runs")
    for run_id, expected in _EXPECTED_RUNS.items():
        run = indexed[run_id]
        if (
            run.get("split") != expected["split"]
            or run.get("model") != "logistic_regression"
            or not isinstance(run.get("seed"), int)
            or isinstance(run.get("seed"), bool)
        ):
            raise WorkspacePolicyError("experiment_plan_runs")
        for name, expected_value in expected.items():
            if run.get(name) != expected_value:
                raise WorkspacePolicyError("experiment_plan_runs")
        expected_group = expected.get("groupBy")
        expected_drops = expected.get("dropFeatures", [])
        if (
            run.get("groupBy") != expected_group
            or run.get("dropFeatures", []) != expected_drops
        ):
            raise WorkspacePolicyError("experiment_plan_runs")
    if len({run["seed"] for run in indexed.values()}) != 1:
        raise WorkspacePolicyError("experiment_plan_runs")

    resource_limits = value.get("resourceLimits")
    resource_fields = {
        "wallSeconds",
        "memoryMb",
        "maxProcesses",
        "maxFiles",
        "maxOutputBytes",
    }
    if not isinstance(resource_limits, dict) or set(resource_limits) != resource_fields:
        raise WorkspacePolicyError("experiment_plan_resources")
    try:
        limits = RunnerLimits(
            wall_seconds=resource_limits["wallSeconds"],
            memory_mb=resource_limits["memoryMb"],
            max_processes=resource_limits["maxProcesses"],
            max_files=resource_limits["maxFiles"],
            max_output_bytes=resource_limits["maxOutputBytes"],
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise WorkspacePolicyError("experiment_plan_resources") from exc
    return value, limits


def validate_generated_workspace(
    workspace: Path, generated_root: Path
) -> GeneratedWorkspace:
    """Validate containment, exact files, bounded content, plan, and adapter AST."""

    root = _assert_safe_root(generated_root)
    if workspace.is_symlink():
        raise WorkspacePolicyError("workspace_symlink")
    try:
        resolved = workspace.resolve(strict=True)
    except FileNotFoundError as exc:
        raise WorkspacePolicyError("workspace_missing") from exc
    if resolved.parent != root or not resolved.is_dir():
        raise WorkspacePolicyError("workspace_containment")

    entries = list(resolved.iterdir())
    names = {entry.name for entry in entries}
    if names != GENERATED_FILE_NAMES:
        raise WorkspacePolicyError(
            "generated_file_set",
            {
                "expected": sorted(GENERATED_FILE_NAMES),
                "missing": sorted(GENERATED_FILE_NAMES.difference(names)),
                "extra": sorted(names.difference(GENERATED_FILE_NAMES)),
            },
        )
    for entry in entries:
        if entry.is_symlink() or not entry.is_file():
            raise WorkspacePolicyError(
                "generated_file_type", {"fileName": entry.name}
            )

    plan_path = resolved / "experiment-plan.json"
    adapter_path = resolved / "artifact-adapter.py"
    public_tests_path = resolved / "public_tests.py"
    plan_source = _read_bounded(plan_path, _MAX_PLAN_BYTES, "experiment_plan_size")
    try:
        plan_value = json.loads(plan_source)
    except (json.JSONDecodeError, ValueError) as exc:
        raise WorkspacePolicyError("experiment_plan_json") from exc
    if _json_depth(plan_value) > _MAX_JSON_DEPTH:
        raise WorkspacePolicyError("experiment_plan_depth")
    plan, limits = _validate_plan(plan_value)

    adapter_source = _read_bounded(adapter_path, _MAX_SOURCE_BYTES, "adapter_size")
    violations = validate_adapter_source(adapter_source)
    if violations:
        raise WorkspacePolicyError(
            "adapter_ast_policy", {"violations": violations}
        )
    public_tests_source = _read_bounded(
        public_tests_path, _MAX_SOURCE_BYTES, "public_tests_size"
    )
    return GeneratedWorkspace(
        root=resolved,
        plan_path=plan_path,
        adapter_path=adapter_path,
        public_tests_path=public_tests_path,
        plan=plan,
        limits=limits,
        plan_source=plan_source,
        adapter_source=adapter_source,
        public_tests_source=public_tests_source,
    )
