from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
import counterlab_runner.docker as docker_module

from counterlab_runner.docker import (
    CONTAINED_RUNTIME_CALLER_GRACE_SECONDS,
    CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS,
    DockerAdapterExecutor,
    DockerExecutionError,
    RunnerLimits,
    bind_contained_runtime_adapter,
    build_docker_command,
    create_repository_work_directory,
    require_trusted_repository_root,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CONTAINED_RUNTIME_ADAPTER = REPOSITORY_ROOT / "scripts/contained-runtime-adapter.sh"
PUBLIC_FIXTURE = REPOSITORY_ROOT / "fixtures/public/customer_churn.csv"


def _artifacts(workspace: Path, limits: RunnerLimits) -> SimpleNamespace:
    return SimpleNamespace(
        root=workspace,
        limits=limits,
        plan_source="{}\n",
        adapter_source="def build_experiment():\n    return None\n",
        public_tests_source="assert True\n",
    )


def _canonical_hash(value: object) -> str:
    source = json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(source.encode()).hexdigest()


def _runtime_control_receipt(schema_version: str) -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": schema_version,
        "status": "TIMED_OUT_CLEAN",
        "timeoutKind": "WALL_CLOCK",
        "runtimePolicySha256": docker_module.CONTAINED_RUNTIME_POLICY_SHA256,
        "invocationId": "1" * 64,
        "finalContainerId": "2" * 64,
        "commandSha256": "3" * 64,
        "rootlessReceiptFileSha256": hashlib.sha256(b"{}\n").hexdigest(),
        "rootlessReceiptPayloadSha256": "4" * 64,
        "timeoutObserved": True,
        "candidateWallSeconds": 1,
        "elapsedMs": 1_001,
        "cleanupReserveMs": 120_000,
        "taskAbsent": True,
        "containerAbsent": True,
        "snapshotAbsent": True,
        "invocationAliasAbsent": True,
        "imageRootfsAbsent": True,
        "persistedAuthorityVerified": True,
        "readOnlyMountsUnchanged": True,
        "imageRootfsUnchanged": True,
        "resultReleased": False,
    }
    if schema_version == "3":
        payload["qualificationMode"] = "aggregate-timeout-proof-v1"
    return {**payload, "receiptPayloadSha256": _canonical_hash(payload)}


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
    assert "--ipc=private" in command
    assert "--pull=never" in command
    assert (
        f"--ulimit=cpu={limits.wall_seconds}:{limits.wall_seconds}" in command
    )
    assert "--ulimit=as=2147483648:2147483648" in command
    assert (
        f"--ulimit=fsize={limits.max_output_bytes}:{limits.max_output_bytes}"
        in command
    )
    assert "--ulimit=nofile=64:64" in command
    assert not any(argument.startswith("--ulimit=nproc=") for argument in command)
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


def test_contained_runtime_trust_requires_the_exact_repository_adapter(
    tmp_path: Path,
) -> None:
    assert (
        bind_contained_runtime_adapter(
            REPOSITORY_ROOT, str(CONTAINED_RUNTIME_ADAPTER)
        )
        == CONTAINED_RUNTIME_ADAPTER.resolve(strict=True)
    )
    with pytest.raises(ValueError, match="trust is not explicit"):
        DockerAdapterExecutor(
            image="counterlab-runner:local",
            docker_bin=str(CONTAINED_RUNTIME_ADAPTER),
        )
    with pytest.raises(ValueError, match="session identity is required"):
        DockerAdapterExecutor(
            image="counterlab-runner:local",
            docker_bin=str(CONTAINED_RUNTIME_ADAPTER),
            contained_runtime_adapter=CONTAINED_RUNTIME_ADAPTER,
        )
    DockerAdapterExecutor(
        image="counterlab-runner:local",
        docker_bin=str(CONTAINED_RUNTIME_ADAPTER),
        contained_runtime_adapter=CONTAINED_RUNTIME_ADAPTER,
        contained_runtime_session_id="rt-entry123",
    )
    lookalike = tmp_path / "scripts/contained-runtime-adapter.sh"
    lookalike.parent.mkdir()
    lookalike.write_text("#!/bin/sh\n", encoding="utf-8")
    with pytest.raises(ValueError, match="path is not exact"):
        bind_contained_runtime_adapter(
            REPOSITORY_ROOT, str(lookalike)
        )


def test_repository_work_directory_is_physical_private_and_contained(
) -> None:
    work = create_repository_work_directory(REPOSITORY_ROOT, "unit-test")

    assert work.is_relative_to(REPOSITORY_ROOT.resolve(strict=True))
    assert work.parent == (
        REPOSITORY_ROOT / "node_modules/.cache/counterlab-v6.1/tmp"
    ).resolve(strict=True)
    assert work.name.startswith("counterlab-sandbox-unit-test-")
    assert stat.S_IMODE(work.stat().st_mode) == 0o700


def test_repository_work_directory_rejects_a_nested_fake_marker_without_writing(
    tmp_path: Path,
) -> None:
    fake_root = tmp_path / "fake-repository"
    fake_root.mkdir()
    (fake_root / "COUNTERLAB_REPO_ROOT").write_text("test\n", encoding="utf-8")

    with pytest.raises(ValueError, match="trusted physical checkout"):
        create_repository_work_directory(fake_root, "unit-test")

    assert not (fake_root / "node_modules").exists()


def test_trusted_repository_root_rejects_relative_and_nested_callers(
    tmp_path: Path,
) -> None:
    nested = tmp_path / "fake-repository"
    nested.mkdir()
    (nested / "COUNTERLAB_REPO_ROOT").write_text("test\n", encoding="utf-8")

    with pytest.raises(ValueError, match="trusted physical checkout"):
        require_trusted_repository_root(Path("."))
    with pytest.raises(ValueError, match="trusted physical checkout"):
        require_trusted_repository_root(nested)


@pytest.mark.parametrize(
    ("schema_version", "rootless_suffix"),
    [("2", ".receipt.json"), ("3", ".qualified-receipt.json")],
)
def test_runtime_control_receipt_binds_schema_to_exact_rootless_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    schema_version: str,
    rootless_suffix: str,
) -> None:
    session_id = "rt-entry123"
    receipt = _runtime_control_receipt(schema_version)
    rootless_root = tmp_path / ".rt" / session_id / "run/rootless-specs"
    rootless_root.mkdir(parents=True)
    rootless_path = rootless_root / f"{'2' * 64}{rootless_suffix}"
    rootless_path.write_text("{}\n", encoding="utf-8")
    control_path = tmp_path / f"control-v{schema_version}.json"
    control_path.write_text(json.dumps(receipt), encoding="utf-8")
    monkeypatch.setattr(
        docker_module,
        "_trusted_repository_root",
        lambda: tmp_path.resolve(strict=True),
    )

    value, _, observed_rootless_path, observed_rootless_sha256 = (
        docker_module._validate_contained_runtime_control_receipt(
            control_path,
            session_id=session_id,
            expected_wall_seconds=1,
        )
    )

    assert value == receipt
    assert observed_rootless_path == rootless_path
    assert observed_rootless_sha256 == receipt["rootlessReceiptFileSha256"]


@pytest.mark.parametrize(
    "mutation",
    [
        {"qualificationMode": "unknown"},
        {"candidateWallSeconds": True},
    ],
)
def test_runtime_control_receipt_rejects_invalid_v3_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mutation: dict[str, object],
) -> None:
    receipt = {**_runtime_control_receipt("3"), **mutation}
    payload = {
        key: value
        for key, value in receipt.items()
        if key != "receiptPayloadSha256"
    }
    receipt["receiptPayloadSha256"] = _canonical_hash(payload)
    control_path = tmp_path / "control-v3.json"
    control_path.write_text(json.dumps(receipt), encoding="utf-8")
    monkeypatch.setattr(
        docker_module,
        "_trusted_repository_root",
        lambda: tmp_path.resolve(strict=True),
    )

    with pytest.raises(DockerExecutionError, match="runtime_control_invalid"):
        docker_module._validate_contained_runtime_control_receipt(
            control_path,
            session_id="rt-entry123",
            expected_wall_seconds=1,
        )


def test_execution_snapshot_is_the_exact_validated_read_only_source(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    artifacts = SimpleNamespace(
        plan_source='{"schemaVersion":"1"}\n',
        adapter_source="def build_experiment():\n    return None\n",
        public_tests_source="assert True\n",
    )

    assert hasattr(docker_module, "create_execution_snapshot")
    run_root = tmp_path / "runs"
    run_root.mkdir()
    requested_directory_modes: list[tuple[Path, int]] = []
    requested_file_modes: list[int] = []
    original_chmod = docker_module.os.chmod
    original_fchmod = docker_module.os.fchmod

    def recording_chmod(path: Path, mode: int) -> None:
        requested_directory_modes.append((Path(path), mode))
        original_chmod(path, mode)

    def recording_fchmod(descriptor: int, mode: int) -> None:
        requested_file_modes.append(mode)
        original_fchmod(descriptor, mode)

    monkeypatch.setattr(docker_module.os, "chmod", recording_chmod)
    monkeypatch.setattr(docker_module.os, "fchmod", recording_fchmod)
    snapshot = docker_module.create_execution_snapshot(artifacts, run_root)

    assert requested_directory_modes == [(snapshot, 0o555)]
    assert requested_file_modes == [0o444, 0o444, 0o444]
    expected = {
        "experiment-plan.json": artifacts.plan_source,
        "artifact-adapter.py": artifacts.adapter_source,
        "public_tests.py": artifacts.public_tests_source,
    }
    assert {path.name for path in snapshot.iterdir()} == set(expected)
    for path in snapshot.iterdir():
        assert path.read_text(encoding="utf-8") == expected[path.name]
        assert stat.S_IMODE(path.stat().st_mode) & 0o022 == 0


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


@pytest.mark.parametrize(
    ("contained", "with_control_receipt"),
    [(False, False), (True, False), (True, True)],
)
def test_executor_loads_only_bounded_fixed_outputs_and_records_enforcement(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    contained: bool,
    with_control_receipt: bool,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = _artifacts(workspace, RunnerLimits())
    requested_modes: list[tuple[Path, int]] = []
    original_chmod = docker_module.os.chmod

    def recording_chmod(path: Path, mode: int) -> None:
        requested_modes.append((Path(path), mode))
        original_chmod(path, mode)

    monkeypatch.setattr(docker_module.os, "chmod", recording_chmod)

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        output_mount = next(
            item for item in command if isinstance(item, str) and "dst=/output" in item
        )
        output = Path(output_mount.split("src=", 1)[1].split(",dst=", 1)[0])
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
        expected_timeout = (
            20
            + CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS
            + CONTAINED_RUNTIME_CALLER_GRACE_SECONDS
            if contained
            else 22
        )
        assert kwargs["timeout"] == expected_timeout
        if contained and with_control_receipt:
            assert command[:7] == (
                str(CONTAINED_RUNTIME_ADAPTER),
                "--session-id",
                "rt-entry123",
                "--control-receipt",
                str(control_receipt),
                "--",
                "run",
            )
            assert kwargs["env"] == {"PATH": "/usr/bin:/bin"}
        elif contained:
            assert command[:5] == (
                str(CONTAINED_RUNTIME_ADAPTER),
                "--session-id",
                "rt-entry123",
                "--",
                "run",
            )
            assert kwargs["env"] == {"PATH": "/usr/bin:/bin"}
        else:
            assert kwargs["env"] is None
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)
    control_receipt = (
        REPOSITORY_ROOT
        / "node_modules/.cache/counterlab-v6.1/releases"
        / f"timeout-control-{'e' * 40}-{os.getpid()}.json"
    )
    executor = DockerAdapterExecutor(
        image="counterlab-runner:local",
        docker_bin=(str(CONTAINED_RUNTIME_ADAPTER) if contained else "docker"),
        contained_runtime_adapter=(CONTAINED_RUNTIME_ADAPTER if contained else None),
        contained_runtime_session_id=("rt-entry123" if contained else None),
        contained_runtime_control_receipt=(
            control_receipt if with_control_receipt else None
        ),
    )

    record = executor.execute(
        artifacts=artifacts,
        fixture=PUBLIC_FIXTURE,
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
    if contained:
        assert record.evidence["limits"] == {
            "wallSeconds": True,
            "memoryMb": True,
            "maxProcesses": False,
            "maxFiles": True,
            "maxOutputBytes": True,
        }
        assert record.evidence["limitMode"] == (
            "process-address-space-rlimit-with-unenforced-cgroup-intent"
        )
        assert record.evidence["aggregateLimitIntentEnforced"] is False
        assert record.evidence["limitAuthority"]["memoryMb"]["scope"] == (
            "per-process-address-space-rlimit"
        )
        assert record.evidence["limitAuthority"]["maxProcesses"] == {
            "enforced": False,
            "scope": "container-cgroup-pids-intent-unverified",
        }
        assert record.evidence["timeoutAuthority"] == {
            "candidateWallSeconds": 20,
            "controlBudgetSeconds": CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS,
            "callerGraceSeconds": CONTAINED_RUNTIME_CALLER_GRACE_SECONDS,
        }
    else:
        assert all(record.evidence["limits"].values())
        assert record.evidence["limitMode"] == (
            "container-cgroup-and-process-rlimit"
        )
        assert record.evidence["aggregateLimitIntentEnforced"] is True
        assert record.evidence["limitAuthority"]["memoryMb"]["scope"] == (
            "container-cgroup-and-process-address-space-rlimit"
        )
    assert any(
        path.name.startswith("adapter-") and mode == 0o777
        for path, mode in requested_modes
    )


def test_executor_cleans_only_the_owned_container_when_wall_clock_expires(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = _artifacts(workspace, RunnerLimits(wall_seconds=1))
    commands: list[tuple[str, ...]] = []
    container_id = "a" * 64
    inspect_count = 0

    def fake_run(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[bytes]:
        nonlocal inspect_count
        commands.append(command)
        if command[1] == "run":
            raise subprocess.TimeoutExpired(command, timeout=3)
        if command[1] == "inspect":
            inspect_count += 1
            if inspect_count == 3:
                return subprocess.CompletedProcess(
                    command, 1, stdout=b"", stderr=b"No such object\n"
                )
            invocation = next(
                value.split("=", 2)[2]
                for value in commands[0]
                if value.startswith("--label=io.counterlab.invocation=")
            )
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=f"{container_id} {invocation}\n".encode(),
                stderr=b"",
            )
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)

    with pytest.raises(DockerExecutionError, match="wall_clock_limit"):
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=PUBLIC_FIXTURE,
            run_root=tmp_path / "runs",
        )

    assert [command[1] for command in commands] == [
        "run",
        "inspect",
        "kill",
        "inspect",
        "rm",
        "inspect",
    ]
    assert commands[2][-1] == container_id
    assert commands[4][-1] == container_id


def test_executor_refuses_timeout_cleanup_when_ownership_label_changed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = _artifacts(workspace, RunnerLimits(wall_seconds=1))
    commands: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[bytes]:
        commands.append(command)
        if command[1] == "run":
            raise subprocess.TimeoutExpired(command, timeout=3)
        if command[1] == "inspect":
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=f"{'b' * 64} changed-owner\n".encode(),
                stderr=b"",
            )
        raise AssertionError(f"unsafe cleanup command: {command}")

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)

    with pytest.raises(DockerExecutionError, match="wall_clock_limit") as captured:
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=PUBLIC_FIXTURE,
            run_root=tmp_path / "runs",
        )

    assert captured.value.details["cleanupVerified"] is False
    assert [command[1] for command in commands] == ["run", "inspect"]


def test_contained_runtime_owns_timeout_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = _artifacts(workspace, RunnerLimits(wall_seconds=1))
    commands: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        commands.append(command)
        expected_timeout = (
            1
            + CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS
            + CONTAINED_RUNTIME_CALLER_GRACE_SECONDS
        )
        assert kwargs["timeout"] == expected_timeout
        raise subprocess.TimeoutExpired(command, timeout=expected_timeout)

    monkeypatch.setattr("counterlab_runner.docker.subprocess.run", fake_run)

    with pytest.raises(
        DockerExecutionError, match="runtime_controller_timeout"
    ) as captured:
        DockerAdapterExecutor(
            image="counterlab-runner:local",
            docker_bin=str(CONTAINED_RUNTIME_ADAPTER),
            contained_runtime_adapter=CONTAINED_RUNTIME_ADAPTER,
            contained_runtime_session_id="rt-entry123",
        ).execute(
            artifacts=artifacts,
            fixture=PUBLIC_FIXTURE,
            run_root=tmp_path / "runs",
        )

    assert commands[0][:5] == (
        str(CONTAINED_RUNTIME_ADAPTER),
        "--session-id",
        "rt-entry123",
        "--",
        "run",
    )
    assert captured.value.details == {
        "maximumSeconds": 1,
        "cleanupVerified": False,
    }


def test_contained_runtime_classifies_only_a_bound_control_receipt_as_wall_clock(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = _artifacts(workspace, RunnerLimits(wall_seconds=1))
    control_path = tmp_path / "timeout-control.json"
    rootless_path = tmp_path / "rootless.receipt.json"
    fixture = tmp_path / "fixtures/public/customer_churn.csv"
    fixture.parent.mkdir(parents=True)
    fixture.write_text("observation_id,customer_id,churned\n", encoding="utf-8")
    control_path.write_text("{}\n", encoding="utf-8")
    rootless_path.write_text("{}\n", encoding="utf-8")

    monkeypatch.setattr(
        docker_module,
        "_trusted_repository_root",
        lambda: tmp_path.resolve(strict=True),
    )
    monkeypatch.setattr(
        docker_module,
        "_contained_runtime_control_receipt",
        lambda path: Path(path),
    )
    monkeypatch.setattr(
        docker_module,
        "_validate_contained_runtime_control_receipt",
        lambda path, *, session_id, expected_wall_seconds: (
            {
                "status": "TIMED_OUT_CLEAN",
                "timeoutKind": "WALL_CLOCK",
            },
            "a" * 64,
            rootless_path,
            "b" * 64,
        ),
    )
    monkeypatch.setattr(
        "counterlab_runner.docker.subprocess.run",
        lambda command, **kwargs: subprocess.CompletedProcess(
            command, 1, stdout=b"", stderr=b""
        ),
    )

    with pytest.raises(DockerExecutionError, match="wall_clock_limit") as captured:
        DockerAdapterExecutor(
            image="counterlab-runner:local",
            docker_bin=str(CONTAINED_RUNTIME_ADAPTER),
            contained_runtime_adapter=CONTAINED_RUNTIME_ADAPTER,
            contained_runtime_session_id="rt-entry123",
            contained_runtime_control_receipt=control_path,
        ).execute(
            artifacts=artifacts,
            fixture=fixture,
            run_root=tmp_path / "runs",
        )

    assert captured.value.details["maximumSeconds"] == 1
    assert captured.value.details["timeoutKind"] == "WALL_CLOCK"
    assert captured.value.details["controlStatus"] == "TIMED_OUT_CLEAN"
    assert captured.value.details["cleanupVerified"] is True
    assert captured.value.details["controlReceiptSha256"] == "a" * 64
    assert captured.value.details["rootlessReceiptSha256"] == "b" * 64


def test_executor_preserves_bounded_diagnostics_when_container_exits(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
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
            fixture=PUBLIC_FIXTURE,
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
    workspace.mkdir()
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
            fixture=PUBLIC_FIXTURE,
            run_root=tmp_path / "runs",
        )


def test_executor_rejects_symlinked_run_root(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    run_root = tmp_path / "runs"
    run_root.symlink_to(outside, target_is_directory=True)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = SimpleNamespace(root=workspace, limits=RunnerLimits())

    with pytest.raises(DockerExecutionError, match="run_root_symlink"):
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=PUBLIC_FIXTURE,
            run_root=run_root,
        )


def test_executor_rejects_relative_run_root_and_unregistered_fixture(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    artifacts = _artifacts(workspace, RunnerLimits())
    fixture = tmp_path / "fixture.csv"
    fixture.write_text("x\n", encoding="utf-8")

    with pytest.raises(DockerExecutionError, match="run_root_outside_repository"):
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=PUBLIC_FIXTURE,
            run_root=Path("relative-runs"),
        )
    with pytest.raises(DockerExecutionError, match="fixture_authority"):
        DockerAdapterExecutor(image="counterlab-runner:local").execute(
            artifacts=artifacts,
            fixture=fixture,
            run_root=tmp_path / "runs",
        )
