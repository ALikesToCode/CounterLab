from __future__ import annotations

import json
import stat
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
import counterlab_runner.docker as docker_module

from counterlab_runner.docker import (
    DockerAdapterExecutor,
    DockerExecutionError,
    RunnerLimits,
    build_docker_command,
)


def _artifacts(workspace: Path, limits: RunnerLimits) -> SimpleNamespace:
    return SimpleNamespace(
        root=workspace,
        limits=limits,
        plan_source="{}\n",
        adapter_source="def build_experiment():\n    return None\n",
        public_tests_source="assert True\n",
    )


def test_docker_command_applies_fixed_isolation_and_only_public_mounts(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    fixture = tmp_path / "customer_churn.csv"
    output = tmp_path / "output"
    workspace.mkdir()
    output.mkdir()
    fixture.write_text("observation_id,customer_id,churned\n", encoding="utf-8")
    limits = RunnerLimits()

    command = build_docker_command(
        image="counterlab-runner:local",
        workspace=workspace,
        fixture=fixture,
        output=output,
        limits=limits,
        container_name="counterlab-test",
    )
    joined = " ".join(command)

    assert "--network=none" in command
    assert "--read-only" in command
    assert "--user=65532:65532" in command
    assert "--cap-drop=ALL" in command
    assert "--security-opt=no-new-privileges=true" in command
    assert f"--pids-limit={limits.max_processes}" in command
    assert f"--memory={limits.memory_mb}m" in command
    assert f"--memory-swap={limits.memory_mb}m" in command
    assert "--ipc=none" in command
    assert "--pull=never" in command
    assert f"src={workspace.resolve()},dst=/workspace,readonly" in joined
    assert f"src={fixture.resolve()},dst=/fixtures/customer_churn.csv,readonly" in joined
    assert f"src={output.resolve()},dst=/output" in joined
    assert "services/kernel" not in joined
    assert "verifier.py" not in joined
    assert "held-out" not in joined


def test_runner_limits_reject_values_outside_supported_envelope() -> None:
    with pytest.raises(ValueError, match="wall_seconds"):
        RunnerLimits(wall_seconds=0)
    with pytest.raises(ValueError, match="max_repairs"):
        RunnerLimits(max_repairs=3)


@pytest.mark.parametrize("image", ["", "--privileged", " image", "image\nnext"])
def test_executor_rejects_unsafe_image_references(image: str) -> None:
    with pytest.raises(ValueError, match="image"):
        DockerAdapterExecutor(image=image)


def test_execution_snapshot_is_the_exact_validated_read_only_source(
    tmp_path: Path,
) -> None:
    artifacts = SimpleNamespace(
        plan_source='{"schemaVersion":"1"}\n',
        adapter_source="def build_experiment():\n    return None\n",
        public_tests_source="assert True\n",
    )

    assert hasattr(docker_module, "create_execution_snapshot")
    run_root = tmp_path / "runs"
    run_root.mkdir()
    snapshot = docker_module.create_execution_snapshot(artifacts, run_root)

    assert stat.S_IMODE(snapshot.stat().st_mode) == 0o555
    expected = {
        "experiment-plan.json": artifacts.plan_source,
        "artifact-adapter.py": artifacts.adapter_source,
        "public_tests.py": artifacts.public_tests_source,
    }
    assert {path.name for path in snapshot.iterdir()} == set(expected)
    for path in snapshot.iterdir():
        assert path.read_text(encoding="utf-8") == expected[path.name]
        assert stat.S_IMODE(path.stat().st_mode) == 0o444


def test_output_policy_rejects_too_many_files_and_oversized_output(
    tmp_path: Path,
) -> None:
    output = tmp_path / "output"
    output.mkdir()
    for index in range(3):
        (output / f"{index}.txt").write_text("x", encoding="utf-8")

    executor = DockerAdapterExecutor(
        image="counterlab-runner:local",
        limits=RunnerLimits(max_files=2, max_output_bytes=2),
    )

    with pytest.raises(DockerExecutionError, match="output_file_limit"):
        executor.validate_output_directory(output)

    for path in output.iterdir():
        path.unlink()
    (output / "large.txt").write_bytes(b"abc")
    with pytest.raises(DockerExecutionError, match="output_size_limit"):
        executor.validate_output_directory(output)


def test_output_policy_rejects_symlinks_and_nested_paths(tmp_path: Path) -> None:
    output = tmp_path / "output"
    output.mkdir()
    target = tmp_path / "target"
    target.write_text("data", encoding="utf-8")
    (output / "link").symlink_to(target)

    executor = DockerAdapterExecutor(image="counterlab-runner:local")

    with pytest.raises(DockerExecutionError, match="output_file_type"):
        executor.validate_output_directory(output)


def test_executor_loads_only_bounded_fixed_outputs_and_records_enforcement(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    fixture = tmp_path / "customer_churn.csv"
    workspace.mkdir()
    fixture.write_text("observation_id,customer_id,churned\n", encoding="utf-8")
    artifacts = _artifacts(workspace, RunnerLimits())

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        output_mount = next(
            item for item in command if isinstance(item, str) and "dst=/output" in item
        )
        output = Path(output_mount.split("src=", 1)[1].split(",dst=", 1)[0])
        assert stat.S_IMODE(output.stat().st_mode) == 0o777
        (output / "adapter-contract.json").write_text(
            json.dumps({"runs": []}), encoding="utf-8"
        )
        (output / "runner-evidence.json").write_text(
            json.dumps(
                {
                    "networkDenied": True,
                    "hiddenReadAttemptsDenied": True,
                    "containerUser": "65532:65532",
                }
            ),
            encoding="utf-8",
        )
        (output / "public-tests.stdout").write_text("ok\n", encoding="utf-8")
        (output / "public-tests.stderr").write_text("", encoding="utf-8")
        assert kwargs["timeout"] == 22
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)
    executor = DockerAdapterExecutor(image="counterlab-runner:local")

    record = executor.execute(
        artifacts=artifacts,
        fixture=fixture,
        run_root=tmp_path / "runs",
    )

    assert record.exit_code == 0
    assert record.adapter_contract == {"runs": []}
    assert record.stdout_excerpt == "ok\n"
    assert record.evidence["networkDenied"] is True
    assert record.evidence["mountedTargets"] == [
        "/workspace",
        "/fixtures/customer_churn.csv",
        "/output",
    ]
    assert all(record.evidence["limits"].values())


def test_executor_kills_named_container_when_wall_clock_expires(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    fixture = tmp_path / "fixture.csv"
    workspace.mkdir()
    fixture.write_text("x\n", encoding="utf-8")
    artifacts = _artifacts(workspace, RunnerLimits(wall_seconds=1))
    commands: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[bytes]:
        commands.append(command)
        if command[1] == "run":
            raise subprocess.TimeoutExpired(command, timeout=3)
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)

    with pytest.raises(DockerExecutionError, match="wall_clock_limit"):
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=fixture,
            run_root=tmp_path / "runs",
        )

    assert [command[1] for command in commands] == ["run", "kill", "rm"]


def test_executor_preserves_bounded_diagnostics_when_container_exits(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    fixture = tmp_path / "fixture.csv"
    workspace.mkdir()
    fixture.write_text("x\n", encoding="utf-8")
    artifacts = _artifacts(workspace, RunnerLimits())

    def fake_run(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[bytes]:
        output_mount = next(item for item in command if "dst=/output" in item)
        output = Path(output_mount.split("src=", 1)[1].split(",dst=", 1)[0])
        (output / "public-tests.stdout").write_text(
            "public runner output", encoding="utf-8"
        )
        (output / "public-tests.stderr").write_text(
            "TypeError: unsupported SDK argument" + "x" * 5_000,
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(
            command,
            23,
            stdout=b"",
            stderr=b"",
        )

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)

    with pytest.raises(DockerExecutionError, match="candidate_exit") as captured:
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=fixture,
            run_root=tmp_path / "runs",
        )

    assert captured.value.details["exitCode"] == 23
    assert captured.value.details["stdoutExcerpt"] == "public runner output"
    assert str(captured.value.details["stderrExcerpt"]).startswith(
        "TypeError: unsupported SDK argument"
    )
    assert len(str(captured.value.details["stderrExcerpt"])) <= 4_000


def test_executor_applies_the_approved_plan_output_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    fixture = tmp_path / "fixture.csv"
    workspace.mkdir()
    fixture.write_text("x\n", encoding="utf-8")
    artifacts = _artifacts(workspace, RunnerLimits(max_output_bytes=64))

    def fake_run(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[bytes]:
        output_mount = next(item for item in command if "dst=/output" in item)
        output = Path(output_mount.split("src=", 1)[1].split(",dst=", 1)[0])
        (output / "adapter-contract.json").write_text(
            json.dumps({"runs": [], "padding": "x" * 80}), encoding="utf-8"
        )
        (output / "runner-evidence.json").write_text("{}", encoding="utf-8")
        (output / "public-tests.stdout").write_text("", encoding="utf-8")
        (output / "public-tests.stderr").write_text("", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)

    with pytest.raises(DockerExecutionError, match="output_size_limit"):
        DockerAdapterExecutor(
            image="counterlab-runner:local",
            limits=RunnerLimits(max_output_bytes=1_048_576),
        ).execute(
            artifacts=artifacts,
            fixture=fixture,
            run_root=tmp_path / "runs",
        )


def test_executor_rejects_symlinked_run_root(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    run_root = tmp_path / "runs"
    run_root.symlink_to(outside, target_is_directory=True)
    workspace = tmp_path / "workspace"
    fixture = tmp_path / "fixture.csv"
    workspace.mkdir()
    fixture.write_text("x\n", encoding="utf-8")
    artifacts = SimpleNamespace(root=workspace, limits=RunnerLimits())

    with pytest.raises(DockerExecutionError, match="run_root_symlink"):
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=fixture,
            run_root=run_root,
        )
