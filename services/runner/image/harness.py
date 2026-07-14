"""Fixed container entrypoint for declarative CounterLab adapters."""

from __future__ import annotations

import importlib.util
import json
import os
import socket
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

from counterlab_sdk import Experiment


_INITIAL_OUTPUTS = frozenset({"public-tests.stdout", "public-tests.stderr"})
_PROTECTED_PATHS = (
    Path("/hidden-verifier"),
    Path("/held-out"),
    Path("/repo"),
)


def network_is_denied() -> bool:
    """Probe a public IP; Docker's `network=none` must prevent connection."""

    connection = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    connection.settimeout(0.5)
    try:
        return connection.connect_ex(("1.1.1.1", 443)) != 0
    finally:
        connection.close()


def protected_reads_are_denied() -> bool:
    """Confirm the fixed protected locations are absent or unreadable."""

    for path in _PROTECTED_PATHS:
        try:
            descriptor = os.open(path, os.O_RDONLY)
        except (FileNotFoundError, PermissionError):
            continue
        except OSError:
            if path.exists():
                return False
            continue
        else:
            os.close(descriptor)
            return False
    return True


def _create_output(path: Path):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    os.fchmod(descriptor, 0o644)
    return os.fdopen(descriptor, "w", encoding="utf-8")


def _write_json(path: Path, value: object) -> None:
    with _create_output(path) as stream:
        json.dump(
            value,
            stream,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
        stream.write("\n")


def _load_adapter(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("artifact_adapter", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("adapter_import_failed")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _output_is_pristine(output: Path) -> bool:
    entries = list(output.iterdir())
    return (
        {entry.name for entry in entries} == _INITIAL_OUTPUTS
        and all(entry.is_file() and not entry.is_symlink() for entry in entries)
    )


def run_harness(
    *,
    workspace: Path,
    output: Path,
    network_denied_probe: Callable[[], bool] = network_is_denied,
    hidden_read_probe: Callable[[], bool] = protected_reads_are_denied,
) -> int:
    adapter_path = workspace / "artifact-adapter.py"
    tests_path = workspace / "public_tests.py"
    if not workspace.is_dir() or not output.is_dir():
        return 10
    if any(path.is_symlink() or not path.is_file() for path in (adapter_path, tests_path)):
        return 11

    try:
        stdout_stream = _create_output(output / "public-tests.stdout")
        stderr_stream = _create_output(output / "public-tests.stderr")
    except OSError:
        return 12
    public_environment = {
        "HOME": "/tmp",
        "LANG": "C.UTF-8",
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONHASHSEED": "0",
        "PYTHONPATH": str(Path(sys.modules[Experiment.__module__].__file__).parent),
    }
    with stdout_stream, stderr_stream:
        completed = subprocess.run(
            [sys.executable, str(tests_path)],
            cwd=workspace,
            env=public_environment,
            stdin=subprocess.DEVNULL,
            stdout=stdout_stream,
            stderr=stderr_stream,
            check=False,
        )
    if completed.returncode != 0 or not _output_is_pristine(output):
        return 20

    try:
        module = _load_adapter(adapter_path)
        builder = getattr(module, "build_experiment", None)
        if not callable(builder):
            return 21
        experiment = builder()
        if not isinstance(experiment, Experiment):
            return 22
        contract = experiment.to_dict()
        evidence = {
            "networkDenied": network_denied_probe() is True,
            "hiddenReadAttemptsDenied": hidden_read_probe() is True,
            "containerUser": f"{os.getuid()}:{os.getgid()}",
        }
        _write_json(output / "adapter-contract.json", contract)
        _write_json(output / "runner-evidence.json", evidence)
    except Exception:
        return 23
    return 0


def main() -> int:
    return run_harness(workspace=Path("/workspace"), output=Path("/output"))


if __name__ == "__main__":
    raise SystemExit(main())
