from __future__ import annotations

import importlib
from argparse import Namespace
import json
import sys
from pathlib import Path

import pytest

from scripts.probe_cpython_htmlparser_reachability import (
    ForbiddenHtmlParserImport,
    HtmlParserImportGuard,
    _assert_operation_registry,
    _review_input,
    run_probe,
    scan_kernel_source,
)


ROOT = Path(__file__).resolve().parents[3]
KERNEL = ROOT / "services" / "kernel" / "src" / "counterlab_kernel"


def test_installed_kernel_source_has_no_direct_html_parser_path() -> None:
    assert scan_kernel_source(KERNEL) == []
    _assert_operation_registry()


def test_source_scan_detects_direct_and_dynamic_html_parser_references(
    tmp_path: Path,
) -> None:
    (tmp_path / "direct.py").write_text(
        "from html.parser import HTMLParser\n", encoding="utf-8"
    )
    (tmp_path / "dynamic.py").write_text(
        'module = "html.parser"\n', encoding="utf-8"
    )

    violations = scan_kernel_source(tmp_path)

    assert len(violations) == 2
    assert any("direct.py" in finding for finding in violations)
    assert any("dynamic.py" in finding for finding in violations)


def test_import_guard_has_a_mandatory_working_negative_control() -> None:
    sys.modules.pop("html.parser", None)
    guard = HtmlParserImportGuard()
    sys.meta_path.insert(0, guard)
    try:
        with pytest.raises(ForbiddenHtmlParserImport):
            importlib.import_module("html.parser")
    finally:
        sys.meta_path.remove(guard)

    assert guard.attempts == ["html.parser"]
    assert "html.parser" not in sys.modules


def test_probe_rejects_a_preloaded_html_parser() -> None:
    importlib.import_module("html.parser")
    try:
        with pytest.raises(RuntimeError, match="loaded before the reachability guard"):
            run_probe(ROOT)
    finally:
        sys.modules.pop("html.parser", None)


def test_review_file_is_source_bound_and_time_bounded(tmp_path: Path) -> None:
    review = {
        "schemaVersion": "2",
        "vulnerabilityId": "CVE-2026-15308",
        "imageDigest": f"sha256:{'a' * 64}",
        "sourceCommit": "b" * 40,
        "sbomSha256": "c" * 64,
        "owner": "counterlab-release-owner",
        "reviewedAt": "2026-07-19T00:00:00.000Z",
        "expiresAt": "2026-08-02T00:00:00.000Z",
        "kevStatus": "NOT_LISTED",
        "kevCheckedAt": "2026-07-19T00:00:00.000Z",
        "kevSource": (
            "https://www.cisa.gov/sites/default/files/feeds/"
            "known_exploited_vulnerabilities.json"
        ),
        "kevCatalogVersion": "2026.07.19",
        "kevCatalogCount": 1_500,
        "kevDateReleased": "2026-07-19T00:00:00.000Z",
        "kevCatalogSha256": "d" * 64,
    }
    review_path = tmp_path / "review.json"
    review_path.write_text(json.dumps(review), encoding="utf-8")
    args = Namespace(
        root=tmp_path,
        review_file=review_path,
        image_digest=review["imageDigest"],
        source_commit=review["sourceCommit"],
        sbom_sha256=review["sbomSha256"],
    )

    assert _review_input(args) == review

    review["expiresAt"] = "2026-08-03T00:00:00.000Z"
    review_path.write_text(json.dumps(review), encoding="utf-8")
    with pytest.raises(RuntimeError, match="timestamps are not bounded"):
        _review_input(args)

    review["expiresAt"] = "2026-08-02T00:00:00.000Z"
    review["kevDateReleased"] = "2026-06-01T00:00:00.000Z"
    review_path.write_text(json.dumps(review), encoding="utf-8")
    with pytest.raises(RuntimeError, match="timestamps are not bounded"):
        _review_input(args)
