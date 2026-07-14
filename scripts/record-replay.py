#!/usr/bin/env python3
"""Record a completed local API session without exposing uploaded bytes."""

from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path


SESSION_ID = re.compile(r"^session_[A-Za-z0-9-]+$")


def _get(url: str) -> object:
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            value = json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"recording request failed ({error.code}): {detail}") from error
    if not value.get("ok"):
        raise SystemExit(f"recording request failed: {value}")
    return value["data"]


def main() -> None:
    parser = argparse.ArgumentParser(prog="record-replay")
    parser.add_argument("session_id")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    arguments = parser.parse_args()
    if not SESSION_ID.fullmatch(arguments.session_id):
        raise SystemExit("session id is invalid")
    base = arguments.base_url.rstrip("/")
    session = _get(f"{base}/api/sessions/{arguments.session_id}")
    events = _get(f"{base}/api/sessions/{arguments.session_id}/events")
    proof = _get(f"{base}/api/sessions/{arguments.session_id}/proof-bundle")
    destination = arguments.root / "data/recordings" / arguments.session_id
    destination.mkdir(parents=True, exist_ok=False)
    for name, value in (
        ("session.json", session),
        ("events.json", events),
        ("proof-bundle.json", proof),
    ):
        (destination / name).write_text(
            f"{json.dumps(value, sort_keys=True, separators=(',', ':'))}\n",
            encoding="utf-8",
        )
    print(f"recorded {arguments.session_id} to {destination}")


if __name__ == "__main__":
    main()
