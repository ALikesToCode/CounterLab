#!/usr/bin/env python3
"""Run fixed low-overhead cgroup-v2 enforcement controls.

This helper is moved into the candidate cgroup before it receives ``GO``.
It intentionally uses ``fork`` instead of a threaded runtime so the control
itself fits within the same strict task limit it is proving.
"""

from __future__ import annotations

import errno
import json
import os
import signal
import sys
import time
from collections.abc import Callable, Sequence
from typing import NoReturn, TypedDict

MINIMUM_MEMORY_BYTES = 64 * 1024 * 1024
MAXIMUM_MEMORY_BYTES = 1280 * 1024 * 1024


class Control(TypedDict, total=False):
    mode: str
    requested_bytes: int
    attempted_processes: int
    busy_window_ms: int
    workers: int


def _positive_integer(value: str) -> int:
    if not value.isascii() or not value.isdecimal() or value.startswith("0"):
        raise ValueError("contained cgroup control integer is invalid")
    parsed = int(value)
    if parsed < 1:
        raise ValueError("contained cgroup control integer is invalid")
    return parsed


def parse_control(arguments: Sequence[str]) -> Control:
    if (
        len(arguments) == 4
        and arguments[:3] == ["--mode", "memory", "--requested-bytes"]
    ):
        requested_bytes = _positive_integer(arguments[3])
        if not MINIMUM_MEMORY_BYTES <= requested_bytes <= MAXIMUM_MEMORY_BYTES:
            raise ValueError("contained cgroup control memory bound is invalid")
        return {"mode": "memory", "requested_bytes": requested_bytes}
    if (
        len(arguments) == 4
        and arguments[:3] == ["--mode", "processes", "--attempted-processes"]
    ):
        attempted_processes = _positive_integer(arguments[3])
        if not 2 <= attempted_processes <= 64:
            raise ValueError("contained cgroup control process bound is invalid")
        return {
            "mode": "processes",
            "attempted_processes": attempted_processes,
        }
    if (
        len(arguments) == 6
        and arguments[:3] == ["--mode", "cpu", "--busy-window-ms"]
        and arguments[4] == "--workers"
    ):
        busy_window_ms = _positive_integer(arguments[3])
        workers = _positive_integer(arguments[5])
        if not 100 <= busy_window_ms <= 5_000 or not 2 <= workers <= 8:
            raise ValueError("contained cgroup control CPU bound is invalid")
        return {
            "mode": "cpu",
            "busy_window_ms": busy_window_ms,
            "workers": workers,
        }
    raise ValueError("contained cgroup control mode or fields are invalid")


def _wait_for_go() -> None:
    sys.stdout.write("READY\n")
    sys.stdout.flush()
    command = sys.stdin.buffer.read(17)
    if command != b"GO\n":
        raise RuntimeError("contained cgroup control handshake is invalid")


class _Termination:
    def __init__(self) -> None:
        self.signal_name: str | None = None
        self.children: set[int] = set()

    def install(self) -> None:
        for candidate in (signal.SIGINT, signal.SIGTERM):
            signal.signal(candidate, self._handle)

    def _handle(self, signum: int, _frame: object) -> None:
        self.signal_name = signal.Signals(signum).name
        self.terminate_children()

    def assert_active(self) -> None:
        if self.signal_name is not None:
            raise RuntimeError(
                f"contained cgroup control interrupted by {self.signal_name}"
            )

    def terminate_children(self) -> None:
        for child in tuple(self.children):
            try:
                os.kill(child, signal.SIGTERM)
            except ProcessLookupError:
                pass

    def reap_children(self) -> None:
        self.terminate_children()
        for child in tuple(self.children):
            try:
                os.waitpid(child, 0)
            except ChildProcessError:
                pass
            finally:
                self.children.discard(child)


def _child_exit(
    callback: Callable[..., None], *arguments: object
) -> NoReturn:
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    try:
        callback(*arguments)
    except BaseException:
        os._exit(70)
    os._exit(0)


def _busy(busy_window_ms: int) -> None:
    deadline = time.monotonic() + (busy_window_ms / 1_000)
    while time.monotonic() < deadline:
        pass


def _cpu_control(
    busy_window_ms: int, workers: int, termination: _Termination
) -> None:
    try:
        for _index in range(workers - 1):
            child = os.fork()
            if child == 0:
                _child_exit(_busy, busy_window_ms)
            termination.children.add(child)
        _busy(busy_window_ms)
        failed = False
        for child in tuple(termination.children):
            _pid, status = os.waitpid(child, 0)
            termination.children.discard(child)
            failed = (
                failed
                or not os.WIFEXITED(status)
                or os.WEXITSTATUS(status) != 0
            )
        termination.assert_active()
        if failed:
            raise RuntimeError("contained cgroup CPU control worker failed")
    finally:
        termination.reap_children()
    print(
        json.dumps(
            {"busyWindowMs": busy_window_ms, "workers": workers},
            separators=(",", ":"),
            sort_keys=True,
        ),
        flush=True,
    )


def _hold() -> None:
    time.sleep(5)


def _process_control(
    attempted_processes: int, termination: _Termination
) -> None:
    denied = False
    try:
        for _index in range(attempted_processes):
            termination.assert_active()
            try:
                child = os.fork()
            except OSError as error:
                if error.errno not in {errno.EAGAIN, errno.ENOMEM}:
                    raise
                denied = True
                break
            if child == 0:
                _child_exit(_hold)
            termination.children.add(child)
    finally:
        termination.reap_children()
    termination.assert_active()
    if not denied:
        raise RuntimeError("contained cgroup process control escaped its limit")
    print(
        json.dumps(
            {"attemptedProcesses": attempted_processes, "denied": True},
            separators=(",", ":"),
            sort_keys=True,
        ),
        flush=True,
    )


def _memory_control(requested_bytes: int, termination: _Termination) -> None:
    with open("/proc/self/oom_score_adj", "w", encoding="ascii") as stream:
        stream.write("1000\n")
    retained: list[bytearray] = []
    allocated = 0
    chunk_bytes = 8 * 1024 * 1024
    while allocated < requested_bytes:
        termination.assert_active()
        size = min(chunk_bytes, requested_bytes - allocated)
        chunk = bytearray(size)
        for offset in range(0, size, 4_096):
            chunk[offset] = 1
        retained.append(chunk)
        allocated += size
    time.sleep(2)
    raise RuntimeError(
        "contained cgroup memory control escaped its limit "
        f"at {len(retained)} chunks"
    )


def main(arguments: Sequence[str]) -> int:
    control = parse_control(arguments)
    termination = _Termination()
    termination.install()
    _wait_for_go()
    termination.assert_active()
    if control["mode"] == "memory":
        _memory_control(control["requested_bytes"], termination)
    elif control["mode"] == "processes":
        _process_control(control["attempted_processes"], termination)
    else:
        _cpu_control(
            control["busy_window_ms"],
            control["workers"],
            termination,
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr, flush=True)
        raise SystemExit(70) from error
