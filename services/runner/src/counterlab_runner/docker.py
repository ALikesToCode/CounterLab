from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .limits import RunnerLimits

if TYPE_CHECKING:
    from .workspace import GeneratedWorkspace


_EXPECTED_OUTPUTS = frozenset(
    {
        "adapter-contract.json",
        "runner-evidence.json",
        "public-tests.stdout",
        "public-tests.stderr",
    }
)
_MAX_DIAGNOSTIC_BYTES = 4_000


def _diagnostic_excerpt(value: bytes | str | None) -> str:
    if value is None:
        return ""
    text = value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value
    return text[:_MAX_DIAGNOSTIC_BYTES]


def _output_diagnostic(output: Path, name: str, fallback: bytes | str | None) -> str:
    excerpt = _diagnostic_excerpt(fallback)
    if excerpt:
        return excerpt
    path = output / name
    if path.is_symlink() or not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:_MAX_DIAGNOSTIC_BYTES]
    except OSError:
        return ""


class DockerExecutionError(RuntimeError):
    def __init__(self, code: str, details: dict[str, object] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class DockerExecutionRecord:
    exit_code: int
    duration_ms: int
    adapter_contract: dict[str, Any]
    evidence: dict[str, Any]
    stdout_excerpt: str = ""
    stderr_excerpt: str = ""


def _mount(source: Path, destination: str, *, readonly: bool) -> str:
    option = f"type=bind,src={source.resolve()},dst={destination}"
    return f"{option},readonly" if readonly else option


def build_docker_command(
    *,
    image: str,
    workspace: Path,
    fixture: Path,
    output: Path,
    limits: RunnerLimits,
    container_name: str,
    docker_bin: str = "docker",
) -> tuple[str, ...]:
    """Build a list-form Docker command with no inherited credentials."""

    return (
        docker_bin,
        "run",
        "--rm",
        f"--name={container_name}",
        "--pull=never",
        "--network=none",
        "--read-only",
        "--user=65532:65532",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges=true",
        "--ipc=none",
        f"--pids-limit={limits.max_processes}",
        f"--memory={limits.memory_mb}m",
        f"--memory-swap={limits.memory_mb}m",
        f"--cpus={limits.cpu_count}",
        f"--ulimit=fsize={limits.max_output_bytes}:{limits.max_output_bytes}",
        "--ulimit=nofile=64:64",
        "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=0700",
        "--mount",
        _mount(workspace, "/workspace", readonly=True),
        "--mount",
        _mount(fixture, "/fixtures/customer_churn.csv", readonly=True),
        "--mount",
        _mount(output, "/output", readonly=False),
        "--env=PYTHONHASHSEED=0",
        "--workdir=/workspace",
        image,
    )


def create_execution_snapshot(
    artifacts: "GeneratedWorkspace", run_root: Path
) -> Path:
    """Write the exact validated sources into a non-root-readable RO snapshot."""

    snapshot = Path(tempfile.mkdtemp(prefix="workspace-", dir=run_root))
    sources = {
        "experiment-plan.json": artifacts.plan_source,
        "artifact-adapter.py": artifacts.adapter_source,
        "public_tests.py": artifacts.public_tests_source,
    }
    for name, source in sources.items():
        path = snapshot / name
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(path, flags, 0o400)
        try:
            with os.fdopen(descriptor, "wb", closefd=False) as stream:
                stream.write(source.encode("utf-8"))
                stream.flush()
            os.fchmod(descriptor, 0o444)
        finally:
            os.close(descriptor)
    os.chmod(snapshot, 0o555)
    return snapshot


class DockerAdapterExecutor:
    """Execute a prevalidated adapter and enforce host-visible output bounds."""

    def __init__(
        self,
        *,
        image: str,
        limits: RunnerLimits | None = None,
        docker_bin: str = "docker",
    ) -> None:
        if (
            not image
            or image != image.strip()
            or image.startswith("-")
            or any(character.isspace() or ord(character) < 32 for character in image)
            or len(image) > 255
        ):
            raise ValueError("image reference is invalid")
        self.image = image
        self.limits = limits or RunnerLimits()
        self.docker_bin = docker_bin

    def validate_output_directory(
        self, output: Path, limits: RunnerLimits | None = None
    ) -> tuple[Path, ...]:
        limits = limits or self.limits
        entries = tuple(output.iterdir())
        if len(entries) > limits.max_files:
            raise DockerExecutionError(
                "output_file_limit",
                {"observed": len(entries), "maximum": limits.max_files},
            )
        total = 0
        for entry in entries:
            if entry.is_symlink() or not entry.is_file():
                raise DockerExecutionError(
                    "output_file_type", {"fileName": entry.name}
                )
            total += entry.stat().st_size
        if total > limits.max_output_bytes:
            raise DockerExecutionError(
                "output_size_limit",
                {"observed": total, "maximum": limits.max_output_bytes},
            )
        return entries

    def _read_json(self, path: Path, limits: RunnerLimits) -> dict[str, Any]:
        if path.stat().st_size > limits.max_output_bytes:
            raise DockerExecutionError("output_size_limit")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            raise DockerExecutionError("output_json_invalid") from exc
        if not isinstance(value, dict):
            raise DockerExecutionError("output_contract_invalid")
        return value

    def _cleanup_timed_out_container(self, container_name: str) -> None:
        for action in ("kill", "rm"):
            command = [self.docker_bin, action]
            if action == "rm":
                command.append("--force")
            command.append(container_name)
            subprocess.run(
                tuple(command),
                capture_output=True,
                check=False,
                timeout=5,
            )

    def execute(
        self,
        *,
        artifacts: "GeneratedWorkspace",
        fixture: Path,
        run_root: Path,
    ) -> DockerExecutionRecord:
        """Run Docker and return only fixed, bounded machine-readable outputs."""

        if run_root.is_symlink():
            raise DockerExecutionError("run_root_symlink")
        run_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        run_root = run_root.resolve(strict=True)
        fixture = fixture.resolve(strict=True)
        limits = artifacts.limits
        workspace_snapshot = create_execution_snapshot(artifacts, run_root)
        output = Path(tempfile.mkdtemp(prefix="adapter-", dir=run_root))
        os.chmod(output, 0o777)
        container_name = f"counterlab-{uuid.uuid4().hex[:20]}"
        command = build_docker_command(
            image=self.image,
            workspace=workspace_snapshot,
            fixture=fixture,
            output=output,
            limits=limits,
            container_name=container_name,
            docker_bin=self.docker_bin,
        )
        started = time.monotonic()
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                check=False,
                timeout=limits.wall_seconds + 2,
            )
        except subprocess.TimeoutExpired as exc:
            self._cleanup_timed_out_container(container_name)
            raise DockerExecutionError(
                "wall_clock_limit", {"maximumSeconds": limits.wall_seconds}
            ) from exc
        duration_ms = int((time.monotonic() - started) * 1_000)
        if completed.returncode != 0:
            raise DockerExecutionError(
                "candidate_exit",
                {
                    "exitCode": completed.returncode,
                    "stdoutExcerpt": _output_diagnostic(
                        output, "public-tests.stdout", completed.stdout
                    ),
                    "stderrExcerpt": _output_diagnostic(
                        output, "public-tests.stderr", completed.stderr
                    ),
                },
            )

        entries = self.validate_output_directory(output, limits)
        names = {entry.name for entry in entries}
        if names != _EXPECTED_OUTPUTS:
            raise DockerExecutionError(
                "output_file_set",
                {
                    "missing": sorted(_EXPECTED_OUTPUTS.difference(names)),
                    "extra": sorted(names.difference(_EXPECTED_OUTPUTS)),
                },
            )
        adapter_contract = self._read_json(output / "adapter-contract.json", limits)
        evidence = self._read_json(output / "runner-evidence.json", limits)
        evidence["mountedTargets"] = [
            "/workspace",
            "/fixtures/customer_churn.csv",
            "/output",
        ]
        evidence["limits"] = {
            "wallSeconds": True,
            "memoryMb": True,
            "maxProcesses": True,
            "maxFiles": True,
            "maxOutputBytes": True,
        }
        excerpt_limit = min(limits.max_output_bytes, 4_096)
        stdout_excerpt = (output / "public-tests.stdout").read_text(
            encoding="utf-8", errors="replace"
        )[:excerpt_limit]
        stderr_excerpt = (output / "public-tests.stderr").read_text(
            encoding="utf-8", errors="replace"
        )[:excerpt_limit]
        return DockerExecutionRecord(
            exit_code=completed.returncode,
            duration_ms=duration_ms,
            adapter_contract=adapter_contract,
            evidence=evidence,
            stdout_excerpt=stdout_excerpt,
            stderr_excerpt=stderr_excerpt,
        )
