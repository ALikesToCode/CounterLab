#!/usr/bin/env python3
"""Fail when common credential shapes occur in selected repository files."""

from __future__ import annotations

import argparse
import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Sequence


ROOT = Path(__file__).resolve().parents[1]
PATTERNS = (
    (
        "OpenAI-style token",
        re.compile(r"(?<![A-Za-z0-9])" + "sk-" + r"[A-Za-z0-9_-]{20,}"),
    ),
    ("GitHub token", re.compile("gh" + r"[pousr]_[A-Za-z0-9]{30,}")),
    ("GitHub fine-grained token", re.compile("github" + r"_pat_[A-Za-z0-9_]{30,}")),
    ("AWS access key", re.compile("AK" + "IA" + r"[A-Z0-9]{16}")),
    (
        "private key",
        re.compile("-" * 5 + r"BEGIN [A-Z ]+PRIVATE KEY" + "-" * 5),
    ),
    (
        "credential assignment",
        re.compile(
            r"(?:OPENAI_API_KEY|OPENAI_BASE_URL|CODEX_AUTH_JSON|CLOUDFLARE_API_TOKEN|"
            r"COUNTERLAB_SIGNING_KEY|COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY|"
            r"COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET|COUNTERLAB_ADMISSION_KEY)"
            + r"\s*(?<![=!<>])=(?!=)\s*[^\s#]+"
        ),
    ),
)


class UnsafeScanPath(RuntimeError):
    """Raised before an unsafe or ambiguous repository path is read."""


def _relative_label(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def _lexical_repository_path(requested: str | Path) -> Path:
    raw = Path(requested)
    if ".." in raw.parts:
        raise UnsafeScanPath(f"path contains unsafe traversal: {requested}")
    candidate = raw if raw.is_absolute() else ROOT / raw
    try:
        candidate.relative_to(ROOT)
    except ValueError as error:
        raise UnsafeScanPath(f"path escapes the repository: {requested}") from error
    return candidate


def _path_kind(mode: int, path: Path) -> str:
    if stat.S_ISLNK(mode):
        raise UnsafeScanPath(
            f"path traverses a repository symlink: {_relative_label(path)}"
        )
    if stat.S_ISREG(mode):
        return "file"
    if stat.S_ISDIR(mode):
        return "directory"
    raise UnsafeScanPath(
        f"path is not a regular file or directory: {_relative_label(path)}"
    )


def assert_repository_path(path: Path) -> Path:
    """Validate an output/config path without following repository symlinks."""

    candidate = _lexical_repository_path(path)
    relative = candidate.relative_to(ROOT)
    current = ROOT
    for component in relative.parts:
        current = current / component
        try:
            metadata = current.lstat()
        except FileNotFoundError:
            break
        if stat.S_ISLNK(metadata.st_mode):
            raise UnsafeScanPath(
                f"path traverses a repository symlink: {_relative_label(candidate)}"
            )

    resolved = candidate.resolve(strict=False)
    try:
        resolved.relative_to(ROOT)
    except ValueError as error:
        raise UnsafeScanPath(
            f"path resolves outside the repository: {_relative_label(candidate)}"
        ) from error
    return candidate


def repository_files() -> list[Path]:
    """Return the existing tracked/untracked default selection unchanged."""

    cache_root = assert_repository_path(
        ROOT / "node_modules/.cache/counterlab-v6.1"
    )
    contained_home = assert_repository_path(cache_root / "home")
    contained_git_config = assert_repository_path(cache_root / "gitconfig")
    environment = os.environ.copy()
    environment.update(
        {
            "HOME": str(contained_home),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": str(contained_git_config),
        }
    )
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        env=environment,
    )
    paths: list[Path] = []
    for name in result.stdout.split(b"\0"):
        if not name:
            continue
        relative = Path(os.fsdecode(name))
        if (
            len(relative.parts) >= 3
            and relative.parts[:2] == ("docs", "audits")
            and "browser-state" in relative.parts
        ):
            continue
        paths.append(_lexical_repository_path(relative))
    return paths


def _validated_existing_path(path: Path) -> tuple[Path, os.stat_result, str]:
    candidate = _lexical_repository_path(path)
    relative = candidate.relative_to(ROOT)
    current = ROOT
    metadata = ROOT.lstat()
    _path_kind(metadata.st_mode, ROOT)
    for component in relative.parts:
        current = current / component
        try:
            metadata = current.lstat()
        except FileNotFoundError as error:
            raise UnsafeScanPath(
                f"repository path is missing: {_relative_label(candidate)}"
            ) from error
        _path_kind(metadata.st_mode, current)
    resolved = candidate.resolve(strict=True)
    try:
        resolved.relative_to(ROOT)
    except ValueError as error:
        raise UnsafeScanPath(
            f"path resolves outside the repository: {_relative_label(candidate)}"
        ) from error
    return candidate, metadata, _path_kind(metadata.st_mode, candidate)


def explicit_repository_files(requested_paths: Sequence[str]) -> list[Path]:
    """Expand explicit files/directories, including ignored build outputs."""

    if not requested_paths:
        raise UnsafeScanPath("at least one explicit repository path is required")

    files: list[Path] = []
    seen_paths: set[Path] = set()
    seen_directories: set[tuple[int, int]] = set()

    def register_path(path: Path) -> None:
        if path in seen_paths:
            raise UnsafeScanPath(
                f"duplicate or overlapping scan path: {_relative_label(path)}"
            )
        seen_paths.add(path)

    def visit(path: Path) -> None:
        candidate, metadata, kind = _validated_existing_path(path)
        register_path(candidate)
        if kind == "file":
            files.append(candidate)
            return

        identity = (metadata.st_dev, metadata.st_ino)
        if identity in seen_directories:
            raise UnsafeScanPath(
                f"duplicate directory traversal: {_relative_label(candidate)}"
            )
        seen_directories.add(identity)
        directory_flags = os.O_RDONLY
        directory_flags |= getattr(os, "O_DIRECTORY", 0)
        directory_flags |= getattr(os, "O_NOFOLLOW", 0)
        try:
            descriptor = os.open(candidate, directory_flags)
        except OSError as error:
            raise UnsafeScanPath(
                "repository directory cannot be opened safely: "
                f"{_relative_label(candidate)}"
            ) from error
        try:
            opened = os.fstat(descriptor)
            if not stat.S_ISDIR(opened.st_mode) or (
                opened.st_dev,
                opened.st_ino,
            ) != identity:
                raise UnsafeScanPath(
                    "repository directory changed during traversal: "
                    f"{_relative_label(candidate)}"
                )
            with os.scandir(descriptor) as entries:
                names = sorted(entry.name for entry in entries)
        finally:
            os.close(descriptor)
        for name in names:
            visit(candidate / name)

    for requested in requested_paths:
        visit(_lexical_repository_path(requested))
    return files


def scan_bytes(path: Path, value: bytes) -> list[str]:
    """Scan arbitrary bytes without discarding invalid UTF-8 or printing content."""

    text = value.decode("utf-8", errors="surrogateescape")
    findings: list[str] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for label, pattern in PATTERNS:
            if not pattern.search(line):
                continue
            if label == "credential assignment" and re.search(
                r"=\s*[\"']?\$", line
            ):
                continue
            findings.append(f"{_relative_label(path)}:{line_number}: {label}")
    return findings


def _read_regular_file(
    path: Path,
    seen_files: set[tuple[int, int]],
) -> bytes:
    candidate, expected, kind = _validated_existing_path(path)
    if kind != "file":
        raise UnsafeScanPath(
            f"scan target is not a regular file: {_relative_label(candidate)}"
        )
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(candidate, flags)
    except OSError as error:
        raise UnsafeScanPath(
            f"repository file cannot be opened safely: {_relative_label(candidate)}"
        ) from error
    try:
        opened = os.fstat(descriptor)
        identity = (opened.st_dev, opened.st_ino)
        if not stat.S_ISREG(opened.st_mode) or identity != (
            expected.st_dev,
            expected.st_ino,
        ):
            raise UnsafeScanPath(
                "repository file changed during traversal: "
                f"{_relative_label(candidate)}"
            )
        if identity in seen_files:
            raise UnsafeScanPath(
                f"duplicate file traversal: {_relative_label(candidate)}"
            )
        seen_files.add(identity)
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            return stream.read()
    finally:
        os.close(descriptor)


def scan_files(paths: Iterable[Path]) -> tuple[list[str], int]:
    findings: list[str] = []
    count = 0
    seen_paths: set[Path] = set()
    seen_files: set[tuple[int, int]] = set()
    for path in paths:
        candidate = _lexical_repository_path(path)
        if candidate in seen_paths:
            raise UnsafeScanPath(
                f"duplicate scan file: {_relative_label(candidate)}"
            )
        seen_paths.add(candidate)
        findings.extend(
            scan_bytes(candidate, _read_regular_file(candidate, seen_files))
        )
        count += 1
    return findings, count


def _parse_arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scan tracked/untracked repository files by default, or scan one or more "
            "explicit repository files/directories (including ignored outputs)."
        )
    )
    parser.add_argument(
        "paths",
        nargs="*",
        metavar="REPOSITORY_PATH",
        help="explicit repository-contained file or directory",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parse_arguments(sys.argv[1:] if argv is None else argv)
    try:
        explicit = bool(arguments.paths)
        paths = (
            explicit_repository_files(arguments.paths)
            if explicit
            else repository_files()
        )
        findings, count = scan_files(paths)
    except (OSError, UnsafeScanPath, UnicodeError) as error:
        print(f"Secret scan refused unsafe repository input: {error}", file=sys.stderr)
        return 2

    if findings:
        print("Potential secrets detected in repository files:")
        print("\n".join(findings))
        return 1
    scope = "explicit repository" if explicit else "repository"
    print(f"Secret scan passed across {count} {scope} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
