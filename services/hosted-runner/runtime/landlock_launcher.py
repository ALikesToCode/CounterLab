#!/usr/bin/env python3
"""Fail-closed Landlock launcher for CounterLab's generated-plan process.

The launcher installs an ABI-v3 filesystem allowlist before replacing itself
with the requested command.  It deliberately does not provide a best-effort
fallback: if Landlock is unavailable or blocked, the command is not executed.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import json
import os
import resource
import stat
import sys
from collections.abc import Sequence


LANDLOCK_CREATE_RULESET_VERSION = 1
LANDLOCK_RULE_PATH_BENEATH = 1

LANDLOCK_ACCESS_FS_EXECUTE = 1 << 0
LANDLOCK_ACCESS_FS_WRITE_FILE = 1 << 1
LANDLOCK_ACCESS_FS_READ_FILE = 1 << 2
LANDLOCK_ACCESS_FS_READ_DIR = 1 << 3
LANDLOCK_ACCESS_FS_REMOVE_DIR = 1 << 4
LANDLOCK_ACCESS_FS_REMOVE_FILE = 1 << 5
LANDLOCK_ACCESS_FS_MAKE_CHAR = 1 << 6
LANDLOCK_ACCESS_FS_MAKE_DIR = 1 << 7
LANDLOCK_ACCESS_FS_MAKE_REG = 1 << 8
LANDLOCK_ACCESS_FS_MAKE_SOCK = 1 << 9
LANDLOCK_ACCESS_FS_MAKE_FIFO = 1 << 10
LANDLOCK_ACCESS_FS_MAKE_BLOCK = 1 << 11
LANDLOCK_ACCESS_FS_MAKE_SYM = 1 << 12
LANDLOCK_ACCESS_FS_REFER = 1 << 13
LANDLOCK_ACCESS_FS_TRUNCATE = 1 << 14

LANDLOCK_ABI_MINIMUM = 3
LANDLOCK_POLICY_VERSION = "counterlab-landlock-path-policy-v1"
PR_SET_NO_NEW_PRIVS = 38

READ_ONLY_FILE_ACCESS = LANDLOCK_ACCESS_FS_READ_FILE
READ_ONLY_DIRECTORY_ACCESS = (
    LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR
)
READ_EXECUTE_DIRECTORY_ACCESS = (
    READ_ONLY_DIRECTORY_ACCESS | LANDLOCK_ACCESS_FS_EXECUTE
)
READ_WRITE_FILE_ACCESS = (
    LANDLOCK_ACCESS_FS_READ_FILE
    | LANDLOCK_ACCESS_FS_WRITE_FILE
    | LANDLOCK_ACCESS_FS_TRUNCATE
)
READ_WRITE_DIRECTORY_ACCESS = (
    READ_ONLY_DIRECTORY_ACCESS
    | LANDLOCK_ACCESS_FS_WRITE_FILE
    | LANDLOCK_ACCESS_FS_REMOVE_DIR
    | LANDLOCK_ACCESS_FS_REMOVE_FILE
    | LANDLOCK_ACCESS_FS_MAKE_DIR
    | LANDLOCK_ACCESS_FS_MAKE_REG
    | LANDLOCK_ACCESS_FS_MAKE_SYM
    | LANDLOCK_ACCESS_FS_REFER
    | LANDLOCK_ACCESS_FS_TRUNCATE
)
HANDLED_ACCESS = (
    LANDLOCK_ACCESS_FS_EXECUTE
    | LANDLOCK_ACCESS_FS_WRITE_FILE
    | LANDLOCK_ACCESS_FS_READ_FILE
    | LANDLOCK_ACCESS_FS_READ_DIR
    | LANDLOCK_ACCESS_FS_REMOVE_DIR
    | LANDLOCK_ACCESS_FS_REMOVE_FILE
    | LANDLOCK_ACCESS_FS_MAKE_CHAR
    | LANDLOCK_ACCESS_FS_MAKE_DIR
    | LANDLOCK_ACCESS_FS_MAKE_REG
    | LANDLOCK_ACCESS_FS_MAKE_SOCK
    | LANDLOCK_ACCESS_FS_MAKE_FIFO
    | LANDLOCK_ACCESS_FS_MAKE_BLOCK
    | LANDLOCK_ACCESS_FS_MAKE_SYM
    | LANDLOCK_ACCESS_FS_REFER
    | LANDLOCK_ACCESS_FS_TRUNCATE
)


class LandlockRulesetAttr(ctypes.Structure):
    _fields_ = [("handled_access_fs", ctypes.c_uint64)]


class LandlockPathBeneathAttr(ctypes.Structure):
    _fields_ = [
        ("allowed_access", ctypes.c_uint64),
        ("parent_fd", ctypes.c_int32),
    ]


def _syscall_numbers() -> tuple[int, int, int]:
    machine = os.uname().machine
    if machine not in {"x86_64", "amd64"}:
        raise RuntimeError(f"unsupported Landlock architecture: {machine}")
    return (444, 445, 446)


def _syscall(libc: ctypes.CDLL, number: int, *arguments: object) -> int:
    result = int(libc.syscall(number, *arguments))
    if result < 0:
        error_number = ctypes.get_errno()
        raise OSError(error_number, os.strerror(error_number))
    return result


def landlock_abi() -> int:
    create_ruleset, _, _ = _syscall_numbers()
    libc = ctypes.CDLL(None, use_errno=True)
    try:
        return _syscall(
            libc,
            create_ruleset,
            ctypes.c_void_p(),
            ctypes.c_size_t(0),
            ctypes.c_uint(LANDLOCK_CREATE_RULESET_VERSION),
        )
    except OSError as error:
        if error.errno in {errno.ENOSYS, errno.EOPNOTSUPP, errno.EINVAL}:
            raise RuntimeError("Landlock is unavailable in this runtime") from error
        raise


def _path_access(
    metadata: os.stat_result, *, writable: bool, executable: bool
) -> int:
    if stat.S_ISDIR(metadata.st_mode):
        if writable:
            return READ_WRITE_DIRECTORY_ACCESS
        return (
            READ_EXECUTE_DIRECTORY_ACCESS
            if executable
            else READ_ONLY_DIRECTORY_ACCESS
        )
    if executable:
        return READ_ONLY_FILE_ACCESS | LANDLOCK_ACCESS_FS_EXECUTE
    return READ_WRITE_FILE_ACCESS if writable else READ_ONLY_FILE_ACCESS


def _add_path_rule(
    libc: ctypes.CDLL,
    add_rule: int,
    ruleset_fd: int,
    path: str,
    *,
    writable: bool,
    executable: bool = False,
) -> None:
    normalized = os.path.realpath(path)
    if not os.path.isabs(normalized) or "\0" in normalized:
        raise RuntimeError(f"Landlock path must be absolute: {path!r}")
    path_fd = os.open(normalized, os.O_PATH | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        metadata = os.fstat(path_fd)
        attribute = LandlockPathBeneathAttr(
            allowed_access=_path_access(
                metadata, writable=writable, executable=executable
            ),
            parent_fd=path_fd,
        )
        _syscall(
            libc,
            add_rule,
            ctypes.c_int(ruleset_fd),
            ctypes.c_int(LANDLOCK_RULE_PATH_BENEATH),
            ctypes.byref(attribute),
            ctypes.c_uint(0),
        )
    finally:
        os.close(path_fd)


def restrict_filesystem(
    read_only_paths: Sequence[str],
    read_execute_paths: Sequence[str],
    read_write_paths: Sequence[str],
) -> int:
    abi = landlock_abi()
    if abi < LANDLOCK_ABI_MINIMUM:
        raise RuntimeError(
            f"Landlock ABI {LANDLOCK_ABI_MINIMUM}+ is required; observed ABI {abi}"
        )

    create_ruleset, add_rule, restrict_self = _syscall_numbers()
    libc = ctypes.CDLL(None, use_errno=True)
    ruleset_attribute = LandlockRulesetAttr(handled_access_fs=HANDLED_ACCESS)
    ruleset_fd = _syscall(
        libc,
        create_ruleset,
        ctypes.byref(ruleset_attribute),
        ctypes.sizeof(ruleset_attribute),
        ctypes.c_uint(0),
    )
    try:
        for path in read_only_paths:
            _add_path_rule(
                libc, add_rule, ruleset_fd, path, writable=False
            )
        for path in read_execute_paths:
            _add_path_rule(
                libc,
                add_rule,
                ruleset_fd,
                path,
                writable=False,
                executable=True,
            )
        for path in read_write_paths:
            _add_path_rule(
                libc, add_rule, ruleset_fd, path, writable=True
            )
        if libc.prctl(
            PR_SET_NO_NEW_PRIVS,
            ctypes.c_ulong(1),
            ctypes.c_ulong(0),
            ctypes.c_ulong(0),
            ctypes.c_ulong(0),
        ) != 0:
            error_number = ctypes.get_errno()
            raise OSError(error_number, os.strerror(error_number))
        _syscall(
            libc,
            restrict_self,
            ctypes.c_int(ruleset_fd),
            ctypes.c_uint(0),
        )
    finally:
        os.close(ruleset_fd)
    return abi


def _arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--print-abi", action="store_true")
    parser.add_argument("--ro", action="append", default=[])
    parser.add_argument("--ro-exec", action="append", default=[])
    parser.add_argument("--rw", action="append", default=[])
    parser.add_argument("command", nargs=argparse.REMAINDER)
    parsed = parser.parse_args(argv)
    if parsed.command[:1] == ["--"]:
        parsed.command = parsed.command[1:]
    return parsed


def main(argv: Sequence[str] | None = None) -> int:
    parsed = _arguments(sys.argv[1:] if argv is None else argv)
    if parsed.print_abi:
        if parsed.ro or parsed.ro_exec or parsed.rw or parsed.command:
            raise RuntimeError("--print-abi cannot be combined with a policy or command")
        print(
            json.dumps(
                {
                    "landlockAbi": landlock_abi(),
                    "policyVersion": LANDLOCK_POLICY_VERSION,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0
    if not parsed.command:
        raise RuntimeError("a command is required")
    restrict_filesystem(parsed.ro, parsed.ro_exec, parsed.rw)
    descriptor_limit = resource.getrlimit(resource.RLIMIT_NOFILE)[0]
    close_limit = (
        1_048_576
        if descriptor_limit == resource.RLIM_INFINITY
        else min(int(descriptor_limit), 1_048_576)
    )
    os.closerange(3, close_limit)
    os.execvpe(parsed.command[0], parsed.command, os.environ.copy())
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"counterlab-landlock: {error}", file=sys.stderr)
        raise SystemExit(78) from error
