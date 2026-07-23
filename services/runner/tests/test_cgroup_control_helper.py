from __future__ import annotations

import errno
import importlib.util
import io
import os
import signal
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


def _helper() -> ModuleType:
    path = (
        Path(__file__).parents[3]
        / "scripts"
        / "contained-cgroup-control-helper.py"
    )
    spec = importlib.util.spec_from_file_location(
        "contained_cgroup_control_helper", path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HELPER = _helper()


def test_control_parser_accepts_only_exact_bounded_modes() -> None:
    assert HELPER.parse_control(
        ["--mode", "memory", "--requested-bytes", str(576 * 1024 * 1024)]
    ) == {"mode": "memory", "requested_bytes": 576 * 1024 * 1024}
    assert HELPER.parse_control(
        ["--mode", "processes", "--attempted-processes", "17"]
    ) == {"mode": "processes", "attempted_processes": 17}
    assert HELPER.parse_control(
        ["--mode", "cpu", "--busy-window-ms", "500", "--workers", "1"]
    ) == {"mode": "cpu", "busy_window_ms": 500, "workers": 1}

    for arguments in (
        ["--mode", "unknown"],
        ["--mode", "memory", "--requested-bytes", "1"],
        ["--mode", "processes", "--attempted-processes", "65"],
        ["--mode", "cpu", "--busy-window-ms", "99", "--workers", "2"],
        ["--mode", "cpu", "--busy-window-ms", "500", "--workers", "0"],
        ["--mode", "memory", "--requested-bytes", "67108864", "extra"],
    ):
        with pytest.raises(ValueError, match="cgroup control"):
            HELPER.parse_control(arguments)


def test_handshake_is_exact_and_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stdout = io.StringIO()
    monkeypatch.setattr(sys, "stdout", stdout)
    monkeypatch.setattr(
        sys, "stdin", SimpleNamespace(buffer=io.BytesIO(b"GO\n"))
    )
    HELPER._wait_for_go()
    assert stdout.getvalue() == "READY\n"

    monkeypatch.setattr(
        sys, "stdin", SimpleNamespace(buffer=io.BytesIO(b"GO\nunexpected"))
    )
    with pytest.raises(RuntimeError, match="handshake"):
        HELPER._wait_for_go()


def test_process_control_records_denial_and_reaps_children(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    attempts = iter((123, OSError(errno.EAGAIN, "bounded")))

    def fork() -> int:
        outcome = next(attempts)
        if isinstance(outcome, OSError):
            raise outcome
        return outcome

    signals: list[tuple[int, signal.Signals]] = []
    waited: list[int] = []
    monkeypatch.setattr(os, "fork", fork)
    monkeypatch.setattr(
        os, "kill", lambda pid, sent: signals.append((pid, sent))
    )
    monkeypatch.setattr(
        os, "waitpid", lambda pid, _options: (waited.append(pid) or pid, 0)
    )
    termination = HELPER._Termination()

    HELPER._process_control(17, termination)

    assert termination.children == set()
    assert signals == [(123, signal.SIGTERM)]
    assert waited == [123]
    assert capsys.readouterr().out == (
        '{"attemptedProcesses":17,"denied":true}\n'
    )


def test_cpu_control_rejects_failed_child_and_leaves_no_descendant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(os, "fork", lambda: 123)
    monkeypatch.setattr(os, "kill", lambda _pid, _signal: None)
    monkeypatch.setattr(os, "waitpid", lambda pid, _options: (pid, 1 << 8))
    monkeypatch.setattr(HELPER, "_busy", lambda _milliseconds: None)
    termination = HELPER._Termination()

    with pytest.raises(RuntimeError, match="CPU control worker"):
        HELPER._cpu_control(100, 2, termination)

    assert termination.children == set()


def test_signal_cleanup_targets_only_owned_children(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    signals: list[tuple[int, signal.Signals]] = []
    monkeypatch.setattr(
        os, "kill", lambda pid, sent: signals.append((pid, sent))
    )
    termination = HELPER._Termination()
    termination.children.update({123, 456})

    termination._handle(signal.SIGTERM, None)

    assert termination.signal_name == "SIGTERM"
    assert sorted(signals) == [
        (123, signal.SIGTERM),
        (456, signal.SIGTERM),
    ]
    with pytest.raises(RuntimeError, match="SIGTERM"):
        termination.assert_active()
