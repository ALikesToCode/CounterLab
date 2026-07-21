from __future__ import annotations

import hashlib
import json
import os
import re
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
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_CONTAINED_RUNTIME_SESSION_ID = re.compile(r"^rt-[a-z0-9][a-z0-9-]{7,13}$")
_CONTAINED_RUNTIME_SUBPROCESS_ENVIRONMENT = {"PATH": "/usr/bin:/bin"}
_AGGREGATE_TIMEOUT_QUALIFICATION_MODE = "aggregate-timeout-proof-v1"
CONTAINED_PROCESS_ADDRESS_SPACE_BYTES = 2 * 1024 * 1024 * 1024
_CONTROL_RECEIPT_V2_KEYS = frozenset(
    {
        "schemaVersion",
        "status",
        "timeoutKind",
        "runtimePolicySha256",
        "invocationId",
        "finalContainerId",
        "commandSha256",
        "rootlessReceiptFileSha256",
        "rootlessReceiptPayloadSha256",
        "timeoutObserved",
        "candidateWallSeconds",
        "elapsedMs",
        "cleanupReserveMs",
        "taskAbsent",
        "containerAbsent",
        "snapshotAbsent",
        "invocationAliasAbsent",
        "imageRootfsAbsent",
        "persistedAuthorityVerified",
        "readOnlyMountsUnchanged",
        "imageRootfsUnchanged",
        "resultReleased",
        "receiptPayloadSha256",
    }
)
_CONTROL_RECEIPT_V3_KEYS = _CONTROL_RECEIPT_V2_KEYS | {"qualificationMode"}
_CONTROL_CLEANUP_FIELDS = (
    "taskAbsent",
    "containerAbsent",
    "snapshotAbsent",
    "invocationAliasAbsent",
    "imageRootfsAbsent",
    "persistedAuthorityVerified",
    "readOnlyMountsUnchanged",
    "imageRootfsUnchanged",
)


def _canonical_json(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _trusted_repository_root() -> Path:
    source = Path(__file__).resolve(strict=True)
    root = source.parents[4]
    marker = root / "COUNTERLAB_REPO_ROOT"
    expected_source = root / "services/runner/src/counterlab_runner/docker.py"
    if source != expected_source or marker.is_symlink() or not marker.is_file():
        raise RuntimeError("trusted physical checkout is unavailable")
    return root


def require_trusted_repository_root(repository_root: Path) -> Path:
    trusted = _trusted_repository_root()
    candidate = Path(repository_root)
    if (
        not candidate.is_absolute()
        or ".." in candidate.parts
        or candidate != trusted
        or candidate.is_symlink()
    ):
        raise ValueError("repository root is not the trusted physical checkout")
    return trusted


def _repository_path(
    path: Path,
    *,
    label: str,
    must_exist: bool,
) -> Path:
    root = _trusted_repository_root()
    candidate = Path(path)
    if not candidate.is_absolute() or ".." in candidate.parts:
        raise DockerExecutionError(f"{label}_outside_repository")
    lexical = Path(os.path.normpath(candidate))
    if lexical == root or not lexical.is_relative_to(root):
        raise DockerExecutionError(f"{label}_outside_repository")
    current = root
    for part in lexical.relative_to(root).parts:
        current /= part
        if current.is_symlink():
            raise DockerExecutionError(f"{label}_symlink")
        if not current.exists():
            break
    if not must_exist:
        return lexical
    try:
        resolved = lexical.resolve(strict=True)
    except OSError as exc:
        raise DockerExecutionError(f"{label}_missing") from exc
    if resolved != lexical or not resolved.is_relative_to(root):
        raise DockerExecutionError(f"{label}_outside_repository")
    return resolved


def _load_contained_runtime_policy() -> dict[str, int | str]:
    path = Path(__file__).with_name("contained-runtime-policy.json")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("contained runtime deadline policy is unreadable") from exc
    expected_keys = {
        "schemaVersion",
        "shortCommandTimeoutMs",
        "executionControlOverheadMs",
        "cleanupReserveMs",
        "callerGraceMs",
    }
    if (
        not isinstance(value, dict)
        or set(value) != expected_keys
        or value.get("schemaVersion") != "1"
        or any(
            not isinstance(value.get(name), int) or int(value[name]) < 1
            for name in expected_keys.difference({"schemaVersion"})
        )
    ):
        raise RuntimeError("contained runtime deadline policy is invalid")
    return value


_CONTAINED_RUNTIME_POLICY = _load_contained_runtime_policy()
CONTAINED_RUNTIME_POLICY_SHA256 = _sha256_bytes(
    Path(__file__).with_name("contained-runtime-policy.json").read_bytes()
)
CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS = (
    int(_CONTAINED_RUNTIME_POLICY["executionControlOverheadMs"])
    + int(_CONTAINED_RUNTIME_POLICY["cleanupReserveMs"])
) // 1_000
CONTAINED_RUNTIME_CALLER_GRACE_SECONDS = (
    int(_CONTAINED_RUNTIME_POLICY["callerGraceMs"]) // 1_000
)
if (
    CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS * 1_000
    != int(_CONTAINED_RUNTIME_POLICY["executionControlOverheadMs"])
    + int(_CONTAINED_RUNTIME_POLICY["cleanupReserveMs"])
    or CONTAINED_RUNTIME_CALLER_GRACE_SECONDS * 1_000
    != int(_CONTAINED_RUNTIME_POLICY["callerGraceMs"])
):
    raise RuntimeError("contained runtime deadline policy uses fractional seconds")


def bind_contained_runtime_adapter(
    repository_root: Path, docker_bin: str
) -> Path | None:
    """Return the exact trusted adapter path, or reject a lookalike path."""

    candidate = Path(docker_bin)
    if candidate.name != "contained-runtime-adapter.sh":
        return None
    if not candidate.is_absolute() or candidate.is_symlink():
        raise ValueError("contained runtime adapter path is not exact")
    root = require_trusted_repository_root(repository_root)
    expected = (root / "scripts/contained-runtime-adapter.sh").resolve(strict=True)
    try:
        candidate_resolved = candidate.resolve(strict=True)
    except OSError as exc:
        raise ValueError("contained runtime adapter path is not exact") from exc
    if candidate_resolved != expected:
        raise ValueError("contained runtime adapter path is not exact")
    return expected


def create_repository_work_directory(repository_root: Path, purpose: str) -> Path:
    """Create a preserved private work directory under the repository runtime root."""

    if (
        not purpose
        or len(purpose) > 48
        or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789-" for character in purpose)
    ):
        raise ValueError("repository work purpose is invalid")
    root = require_trusted_repository_root(repository_root)
    work_root = root
    for name in ("node_modules", ".cache", "counterlab-v6.1", "tmp"):
        path = work_root / name
        if path.exists() and path.is_symlink():
            raise ValueError("repository work root is a symlink")
        path.mkdir(mode=0o700, exist_ok=True)
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(root):
            raise ValueError("repository work root escaped the repository")
        work_root = resolved
    directory = Path(
        tempfile.mkdtemp(prefix=f"counterlab-sandbox-{purpose}-", dir=work_root)
    )
    os.chmod(directory, 0o700)
    resolved_directory = directory.resolve(strict=True)
    if not resolved_directory.is_relative_to(work_root):
        raise ValueError("repository work directory escaped its purpose root")
    return resolved_directory


def _contained_runtime_control_receipt(path: Path) -> Path:
    root = _trusted_repository_root()
    releases_root = _repository_path(
        root / "node_modules/.cache/counterlab-v6.1/releases",
        label="control_receipt_root",
        must_exist=True,
    )
    candidate = _repository_path(
        path,
        label="control_receipt",
        must_exist=False,
    )
    if (
        candidate.parent != releases_root
        or candidate.exists()
        or candidate.is_symlink()
        or re.fullmatch(
            r"timeout-control-[a-f0-9]{40}-[0-9]{1,12}\.json",
            candidate.name,
        )
        is None
    ):
        raise ValueError("contained runtime control receipt path is invalid")
    return candidate


def _validate_contained_runtime_control_receipt(
    path: Path,
    *,
    session_id: str,
    expected_wall_seconds: int,
) -> tuple[dict[str, Any], str, Path, str]:
    control_path = _repository_path(path, label="control_receipt", must_exist=True)
    if not control_path.is_file() or control_path.stat().st_size > 65_536:
        raise DockerExecutionError("runtime_control_invalid")
    try:
        control_bytes = control_path.read_bytes()
        value = json.loads(control_bytes)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DockerExecutionError("runtime_control_invalid") from exc
    if not isinstance(value, dict):
        raise DockerExecutionError("runtime_control_invalid")
    schema_version = value.get("schemaVersion")
    if schema_version == "2":
        expected_keys = _CONTROL_RECEIPT_V2_KEYS
    elif schema_version == "3":
        expected_keys = _CONTROL_RECEIPT_V3_KEYS
    else:
        raise DockerExecutionError("runtime_control_invalid")
    if set(value) != expected_keys:
        raise DockerExecutionError("runtime_control_invalid")
    payload = {
        key: entry for key, entry in value.items() if key != "receiptPayloadSha256"
    }
    clean = all(value.get(field) is True for field in _CONTROL_CLEANUP_FIELDS) and (
        value.get("resultReleased") is False
    )
    if (
        (
            schema_version == "3"
            and value.get("qualificationMode")
            != _AGGREGATE_TIMEOUT_QUALIFICATION_MODE
        )
        or value.get("status") not in {"TIMED_OUT_CLEAN", "TIMED_OUT_UNCLEAN"}
        or value.get("timeoutKind") != "WALL_CLOCK"
        or value.get("runtimePolicySha256") != CONTAINED_RUNTIME_POLICY_SHA256
        or not isinstance(value.get("candidateWallSeconds"), int)
        or isinstance(value.get("candidateWallSeconds"), bool)
        or value["candidateWallSeconds"] != expected_wall_seconds
        or value.get("cleanupReserveMs")
        != int(_CONTAINED_RUNTIME_POLICY["cleanupReserveMs"])
        or not isinstance(value.get("elapsedMs"), int)
        or isinstance(value.get("elapsedMs"), bool)
        or value["elapsedMs"] < 1
        or value["elapsedMs"] > 600_000
        or value.get("timeoutObserved") is not True
        or any(
            not isinstance(value.get(field), bool)
            for field in (*_CONTROL_CLEANUP_FIELDS, "resultReleased")
        )
        or not _SHA256.fullmatch(str(value.get("invocationId", "")))
        or not _SHA256.fullmatch(str(value.get("finalContainerId", "")))
        or not _SHA256.fullmatch(str(value.get("commandSha256", "")))
        or not _SHA256.fullmatch(str(value.get("rootlessReceiptFileSha256", "")))
        or not _SHA256.fullmatch(str(value.get("rootlessReceiptPayloadSha256", "")))
        or not _SHA256.fullmatch(str(value.get("receiptPayloadSha256", "")))
        or _sha256_bytes(_canonical_json(payload).encode())
        != value["receiptPayloadSha256"]
        or (value["status"] == "TIMED_OUT_CLEAN") is not clean
    ):
        raise DockerExecutionError("runtime_control_invalid")
    rootless_path = _repository_path(
        _trusted_repository_root()
        / ".rt"
        / session_id
        / "run/rootless-specs"
        / (
            f"{value['finalContainerId']}.qualified-receipt.json"
            if schema_version == "3"
            else f"{value['finalContainerId']}.receipt.json"
        ),
        label="rootless_receipt",
        must_exist=True,
    )
    if not rootless_path.is_file():
        raise DockerExecutionError("runtime_control_invalid")
    rootless_sha256 = _sha256_bytes(rootless_path.read_bytes())
    if rootless_sha256 != value["rootlessReceiptFileSha256"]:
        raise DockerExecutionError("runtime_control_invalid")
    return value, _sha256_bytes(control_bytes), rootless_path, rootless_sha256


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

    memory_bytes = limits.memory_mb * 1024 * 1024
    address_space_bytes = max(memory_bytes, CONTAINED_PROCESS_ADDRESS_SPACE_BYTES)
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
        "--ipc=private",
        f"--pids-limit={limits.max_processes}",
        f"--memory={limits.memory_mb}m",
        f"--memory-swap={limits.memory_mb}m",
        f"--cpus={limits.cpu_count}",
        f"--ulimit=cpu={limits.wall_seconds}:{limits.wall_seconds}",
        f"--ulimit=as={address_space_bytes}:{address_space_bytes}",
        f"--ulimit=fsize={limits.max_output_bytes}:{limits.max_output_bytes}",
        "--ulimit=nofile=64:64",
        f"--ulimit=nproc={limits.max_processes}:{limits.max_processes}",
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
        contained_runtime_adapter: Path | None = None,
        contained_runtime_session_id: str | None = None,
        contained_runtime_control_receipt: Path | None = None,
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
        if contained_runtime_adapter is None:
            if (
                Path(docker_bin).name == "contained-runtime-adapter.sh"
                or contained_runtime_session_id is not None
                or contained_runtime_control_receipt is not None
            ):
                raise ValueError("contained runtime adapter trust is not explicit")
            self.runtime_owns_cleanup = False
            self._contained_runtime_prefix: tuple[str, ...] = ()
            self._subprocess_environment: dict[str, str] | None = None
            self._contained_runtime_session_id: str | None = None
            self._contained_runtime_control_receipt: Path | None = None
        else:
            expected = contained_runtime_adapter.resolve(strict=True)
            candidate = Path(docker_bin)
            if (
                expected.name != "contained-runtime-adapter.sh"
                or not candidate.is_absolute()
                or candidate.is_symlink()
                or candidate.resolve(strict=True) != expected
            ):
                raise ValueError("contained runtime adapter path is not exact")
            if (
                contained_runtime_session_id is None
                or _CONTAINED_RUNTIME_SESSION_ID.fullmatch(
                    contained_runtime_session_id
                )
                is None
            ):
                raise ValueError("contained runtime session identity is required")
            prefix = (
                str(expected),
                "--session-id",
                contained_runtime_session_id,
            )
            if contained_runtime_control_receipt is not None:
                control_receipt = _contained_runtime_control_receipt(
                    contained_runtime_control_receipt
                )
                prefix = (*prefix, "--control-receipt", str(control_receipt))
            self._contained_runtime_prefix = (*prefix, "--")
            self._subprocess_environment = dict(
                _CONTAINED_RUNTIME_SUBPROCESS_ENVIRONMENT
            )
            self._contained_runtime_session_id = contained_runtime_session_id
            self._contained_runtime_control_receipt = (
                control_receipt
                if contained_runtime_control_receipt is not None
                else None
            )
            self.runtime_owns_cleanup = True

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

    def _inspect_owned_container(
        self, container_reference: str, invocation_id: str
    ) -> str | None:
        command = (
            self.docker_bin,
            "inspect",
            "--format={{.Id}} {{index .Config.Labels \"io.counterlab.invocation\"}}",
            container_reference,
        )
        inspected = subprocess.run(
            command,
            capture_output=True,
            check=False,
            timeout=5,
        )
        if inspected.returncode != 0:
            diagnostic = (inspected.stderr or b"").decode("utf-8", errors="replace")
            if "No such object" in diagnostic or "No such container" in diagnostic:
                return None
            raise DockerExecutionError("timeout_cleanup_inspection")
        fields = (inspected.stdout or b"").decode("utf-8", errors="strict").split()
        if (
            len(fields) != 2
            or len(fields[0]) != 64
            or any(character not in "0123456789abcdef" for character in fields[0])
            or fields[1] != invocation_id
        ):
            raise DockerExecutionError("timeout_cleanup_ownership")
        return fields[0]

    def _cleanup_timed_out_container(
        self, container_name: str, invocation_id: str
    ) -> None:
        container_id = self._inspect_owned_container(container_name, invocation_id)
        if container_id is None:
            return
        subprocess.run(
            (self.docker_bin, "kill", container_id),
            capture_output=True,
            check=False,
            timeout=5,
        )
        after_kill = self._inspect_owned_container(container_id, invocation_id)
        if after_kill is None:
            return
        if after_kill != container_id:
            raise DockerExecutionError("timeout_cleanup_ownership")
        subprocess.run(
            (self.docker_bin, "rm", "--force", container_id),
            capture_output=True,
            check=False,
            timeout=5,
        )
        if self._inspect_owned_container(container_id, invocation_id) is not None:
            raise DockerExecutionError("timeout_cleanup_incomplete")

    def execute(
        self,
        *,
        artifacts: "GeneratedWorkspace",
        fixture: Path,
        run_root: Path,
    ) -> DockerExecutionRecord:
        """Run Docker and return only fixed, bounded machine-readable outputs."""

        run_root = _repository_path(
            run_root,
            label="run_root",
            must_exist=False,
        )
        run_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        run_root = _repository_path(run_root, label="run_root", must_exist=True)
        workspace_root = _repository_path(
            artifacts.root,
            label="workspace",
            must_exist=True,
        )
        if not workspace_root.is_dir():
            raise DockerExecutionError("workspace_missing")
        fixture = _repository_path(fixture, label="fixture", must_exist=True)
        expected_fixture = (
            _trusted_repository_root() / "fixtures/public/customer_churn.csv"
        )
        if fixture != expected_fixture or not fixture.is_file():
            raise DockerExecutionError("fixture_authority")
        limits = artifacts.limits
        workspace_snapshot = create_execution_snapshot(artifacts, run_root)
        output = Path(tempfile.mkdtemp(prefix="adapter-", dir=run_root))
        os.chmod(output, 0o777)
        container_name = f"counterlab-{uuid.uuid4().hex[:20]}"
        invocation_id = container_name.removeprefix("counterlab-")
        command = build_docker_command(
            image=self.image,
            workspace=workspace_snapshot,
            fixture=fixture,
            output=output,
            limits=limits,
            container_name=container_name,
            docker_bin=self.docker_bin,
        )
        if self.runtime_owns_cleanup:
            command = (*self._contained_runtime_prefix, *command[1:])
        else:
            command = (
                command[0],
                command[1],
                f"--label=io.counterlab.invocation={invocation_id}",
                *command[2:],
            )
        started = time.monotonic()
        timeout_grace_seconds = (
            CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS
            + CONTAINED_RUNTIME_CALLER_GRACE_SECONDS
            if self.runtime_owns_cleanup
            else 2
        )
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                check=False,
                env=self._subprocess_environment,
                timeout=limits.wall_seconds + timeout_grace_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            if self.runtime_owns_cleanup:
                raise DockerExecutionError(
                    "runtime_controller_timeout",
                    {
                        "maximumSeconds": limits.wall_seconds,
                        "cleanupVerified": False,
                    },
                ) from exc
            if not self.runtime_owns_cleanup:
                try:
                    self._cleanup_timed_out_container(
                        container_name, invocation_id
                    )
                except (
                    DockerExecutionError,
                    OSError,
                    subprocess.SubprocessError,
                    UnicodeError,
                ) as cleanup_error:
                    raise DockerExecutionError(
                        "wall_clock_limit",
                        {
                            "maximumSeconds": limits.wall_seconds,
                            "cleanupVerified": False,
                            "cleanupFailure": type(cleanup_error).__name__,
                        },
                    ) from exc
            raise DockerExecutionError(
                "wall_clock_limit",
                {
                    "maximumSeconds": limits.wall_seconds,
                    "cleanupVerified": True,
                },
            ) from exc
        duration_ms = int((time.monotonic() - started) * 1_000)
        if completed.returncode != 0:
            if (
                self.runtime_owns_cleanup
                and self._contained_runtime_control_receipt is not None
                and self._contained_runtime_control_receipt.exists()
            ):
                try:
                    control, control_sha256, rootless_path, rootless_sha256 = (
                        _validate_contained_runtime_control_receipt(
                            self._contained_runtime_control_receipt,
                            session_id=str(self._contained_runtime_session_id),
                            expected_wall_seconds=limits.wall_seconds,
                        )
                    )
                except (DockerExecutionError, OSError, ValueError) as exc:
                    raise DockerExecutionError(
                        "runtime_control_invalid",
                        {"cause": type(exc).__name__},
                    ) from exc
                root = _trusted_repository_root()
                raise DockerExecutionError(
                    "wall_clock_limit",
                    {
                        "maximumSeconds": limits.wall_seconds,
                        "timeoutKind": control["timeoutKind"],
                        "controlStatus": control["status"],
                        "cleanupVerified": control["status"]
                        == "TIMED_OUT_CLEAN",
                        "controlReceipt": str(
                            self._contained_runtime_control_receipt.relative_to(root)
                        ),
                        "controlReceiptSha256": control_sha256,
                        "rootlessReceipt": str(rootless_path.relative_to(root)),
                        "rootlessReceiptSha256": rootless_sha256,
                    },
                )
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
        evidence["limitMode"] = (
            "process-address-space-rlimit-with-unenforced-cgroup-intent"
            if self.runtime_owns_cleanup
            else "container-cgroup-and-process-rlimit"
        )
        evidence["aggregateLimitIntentEnforced"] = not self.runtime_owns_cleanup
        evidence["intendedAggregateLimits"] = {
            "cpuCount": limits.cpu_count,
            "maxProcesses": limits.max_processes,
            "memoryBytes": limits.memory_mb * 1024 * 1024,
        }
        if self.runtime_owns_cleanup:
            evidence["limitAuthority"] = {
                "wallSeconds": {
                    "enforced": True,
                    "scope": "request-deadline-and-process-cpu-rlimit",
                },
                "memoryMb": {
                    "enforced": True,
                    "scope": "per-process-address-space-rlimit",
                },
                "maxProcesses": {
                    "enforced": True,
                    "scope": "real-user-process-count-rlimit",
                },
                "maxFiles": {
                    "enforced": True,
                    "scope": "host-output-postcondition",
                },
                "maxOutputBytes": {
                    "enforced": True,
                    "scope": "process-file-rlimit-and-host-output-postcondition",
                },
            }
            evidence["timeoutAuthority"] = {
                "candidateWallSeconds": limits.wall_seconds,
                "controlBudgetSeconds": CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS,
                "callerGraceSeconds": CONTAINED_RUNTIME_CALLER_GRACE_SECONDS,
            }
        else:
            evidence["limitAuthority"] = {
                "wallSeconds": {
                    "enforced": True,
                    "scope": "request-deadline-and-process-cpu-rlimit",
                },
                "memoryMb": {
                    "enforced": True,
                    "scope": "container-cgroup-and-process-address-space-rlimit",
                },
                "maxProcesses": {
                    "enforced": True,
                    "scope": "container-cgroup-and-process-count-rlimit",
                },
                "maxFiles": {
                    "enforced": True,
                    "scope": "host-output-postcondition",
                },
                "maxOutputBytes": {
                    "enforced": True,
                    "scope": "process-file-rlimit-and-host-output-postcondition",
                },
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
