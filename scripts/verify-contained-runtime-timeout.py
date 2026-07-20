#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib
import json
import os
import site
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Sequence


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="verify-contained-runtime-timeout")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--build-receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser


def _trusted_repository_root(candidate: Path) -> Path:
    if not candidate.is_absolute() or ".." in candidate.parts:
        raise RuntimeError("repository root must be an absolute physical path")
    try:
        root = candidate.resolve(strict=True)
    except OSError as exc:
        raise RuntimeError("repository root is unavailable") from exc
    marker = root / "COUNTERLAB_REPO_ROOT"
    expected_driver = root / "scripts/verify-contained-runtime-timeout.py"
    driver = Path(__file__).resolve(strict=True)
    if (
        root != candidate
        or candidate.is_symlink()
        or marker.is_symlink()
        or not marker.is_file()
        or expected_driver.is_symlink()
        or not expected_driver.is_file()
        or driver != expected_driver
    ):
        raise RuntimeError("repository root is not the trusted physical checkout")
    return root


def _reject_ambient_python_configuration() -> None:
    for name in ("PYTHONPATH", "PYTHONHOME"):
        if name in os.environ:
            raise RuntimeError(f"{name} must be unset")
    if (
        sys.flags.isolated != 1
        or sys.flags.no_user_site != 1
        or not sys.flags.safe_path
        or site.ENABLE_USER_SITE is not False
    ):
        raise RuntimeError(
            "Python isolated mode is required; invoke the timeout proof with -I"
        )


def _load_timeout_proof(
    root: Path,
) -> Callable[[Path, Path, Path, str], dict[str, Any]]:
    runner_source = root / "services/runner/src"
    kernel_source = root / "services/kernel/src"
    for path, label in (
        (runner_source, "runner source"),
        (kernel_source, "kernel source"),
    ):
        if path.is_symlink() or not path.is_dir() or path.resolve(strict=True) != path:
            raise RuntimeError(f"{label} is not a trusted physical directory")
    sys.path[:0] = [str(runner_source), str(kernel_source)]
    module: ModuleType = importlib.import_module("counterlab_runner.timeout_proof")
    expected_module = (
        root / "services/runner/src/counterlab_runner/timeout_proof.py"
    )
    observed_module = Path(str(module.__file__)).resolve(strict=True)
    if expected_module.is_symlink() or observed_module != expected_module:
        raise RuntimeError("timeout proof module did not resolve from the trusted checkout")
    proof = getattr(module, "run_timeout_cleanup_proof", None)
    if not callable(proof):
        raise RuntimeError("timeout proof entry point is unavailable")
    return proof


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    root = _trusted_repository_root(arguments.root)
    _reject_ambient_python_configuration()
    run_timeout_cleanup_proof = _load_timeout_proof(root)
    report = run_timeout_cleanup_proof(
        root,
        arguments.build_receipt,
        arguments.output,
        arguments.session_id,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
