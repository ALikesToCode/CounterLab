#!/usr/bin/env python3
"""Fail when common credential shapes occur in tracked or untracked repo text."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERNS = (
    ("OpenAI-style token", re.compile("sk-" + r"[A-Za-z0-9_-]{20,}")),
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


def assert_repository_path(path: Path) -> Path:
    try:
        relative = path.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError(f"path escapes the repository: {path}") from error

    current = ROOT
    for component in relative.parts:
        current = current / component
        if current.is_symlink():
            raise RuntimeError(f"path traverses a repository symlink: {path}")
        if not current.exists():
            break

    resolved = path.resolve(strict=False)
    try:
        resolved.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError(f"path resolves outside the repository: {path}") from error
    return path


def repository_files() -> list[Path]:
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
        relative = Path(name.decode())
        if (
            len(relative.parts) >= 3
            and relative.parts[:2] == ("docs", "audits")
            and "browser-state" in relative.parts
        ):
            continue
        paths.append(ROOT / relative)
    return paths


def main() -> int:
    findings: list[str] = []
    paths = repository_files()
    for path in paths:
        if path.is_symlink():
            findings.append(f"{path.relative_to(ROOT)}: repository symlink is not scanned")
            continue
        try:
            resolved = path.resolve(strict=True)
            resolved.relative_to(ROOT)
        except (FileNotFoundError, ValueError):
            findings.append(
                f"{path.relative_to(ROOT)}: repository path is missing or escaped"
            )
            continue
        if not resolved.is_file():
            continue
        text = resolved.read_bytes().decode("utf-8", errors="ignore")
        for line_number, line in enumerate(text.splitlines(), start=1):
            for label, pattern in PATTERNS:
                if pattern.search(line):
                    if label == "credential assignment" and re.search(
                        r"=\s*[\"']?\$", line
                    ):
                        continue
                    findings.append(f"{path.relative_to(ROOT)}:{line_number}: {label}")
    if findings:
        print("Potential secrets detected in repository files:")
        print("\n".join(findings))
        return 1
    print(f"Secret scan passed across {len(paths)} repository files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
