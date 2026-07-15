#!/usr/bin/env python3
"""Fail-closed AST audit for undeclared scientific Python imports."""

from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
from typing import Any, Sequence


SCIENTIFIC_IMPORT_ROOTS = frozenset(
    {
        "Bio",
        "cantera",
        "hypothesis",
        "networkx",
        "numpy",
        "pandas",
        "pint",
        "rdkit",
        "scipy",
        "sklearn",
        "sympy",
    }
)

PACKAGE_IMPORT_ALIASES = {
    "biopython": "Bio",
    "scikit-learn": "sklearn",
}


def _registered_roots(registry: dict[str, Any]) -> set[str]:
    roots: set[str] = set()
    for engine in registry.get("engines", []):
        if not isinstance(engine, dict):
            continue
        package_name = engine.get("packageName")
        if not isinstance(package_name, str):
            continue
        roots.add(PACKAGE_IMPORT_ALIASES.get(package_name, package_name.replace("-", "_")))
    return roots


def _module_root(module: str) -> str:
    return module.split(".", maxsplit=1)[0]


def _dynamic_imports(tree: ast.AST) -> list[tuple[str, int]]:
    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not node.args:
            continue
        function = node.func
        is_import = isinstance(function, ast.Name) and function.id == "__import__"
        is_import_module = (
            isinstance(function, ast.Attribute)
            and isinstance(function.value, ast.Name)
            and function.value.id == "importlib"
            and function.attr == "import_module"
        )
        if not (is_import or is_import_module):
            continue
        argument = node.args[0]
        if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
            imports.append((argument.value, node.lineno))
    return imports


def scan_imports(root: Path, registry: dict[str, Any]) -> list[dict[str, Any]]:
    """Return structured findings for scientific imports not admitted by registry."""

    root = root.resolve()
    registered = _registered_roots(registry)
    findings: list[dict[str, Any]] = []
    scan_roots = [
        root / "services" / "kernel" / "src",
        root / "services" / "runner" / "src",
    ]
    paths = sorted(
        path
        for scan_root in scan_roots
        if scan_root.exists()
        for path in scan_root.rglob("*.py")
        if "__pycache__" not in path.parts
    )
    for path in paths:
        relative_path = path.relative_to(root).as_posix()
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative_path)
        except (OSError, UnicodeError, SyntaxError) as error:
            findings.append(
                {
                    "code": "SCIENTIFIC_IMPORT_SCAN_FAILED",
                    "path": relative_path,
                    "message": str(error),
                }
            )
            continue

        imports: list[tuple[str, int]] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend((alias.name, node.lineno) for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.append((node.module, node.lineno))
        imports.extend(_dynamic_imports(tree))

        for module, line in imports:
            module_root = _module_root(module)
            if module_root in SCIENTIFIC_IMPORT_ROOTS and module_root not in registered:
                findings.append(
                    {
                        "code": "UNDECLARED_SCIENTIFIC_IMPORT",
                        "path": f"{relative_path}:{line}",
                        "module": module_root,
                        "message": (
                            f"Scientific import {module_root} has no admitted engine descriptor."
                        ),
                    }
                )
    return sorted(findings, key=lambda item: (str(item["code"]), str(item["path"])))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--registry", type=Path, default=Path("scientific-engines/registry.json")
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    registry_path = args.registry
    if not registry_path.is_absolute():
        registry_path = root / registry_path
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    findings = scan_imports(root, registry)
    report = {"status": "VERIFIED" if not findings else "REJECTED", "findings": findings}
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())

