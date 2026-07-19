#!/usr/bin/env python3
"""Fail when common credential shapes occur in tracked or untracked repo text."""

from __future__ import annotations

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


def repository_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
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
        if not path.is_file():
            continue
        text = path.read_bytes().decode("utf-8", errors="ignore")
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
