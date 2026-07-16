from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

from scripts.probe_cpython_htmlparser_reachability import (
    ForbiddenHtmlParserImport,
    HtmlParserImportGuard,
    _assert_operation_registry,
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
