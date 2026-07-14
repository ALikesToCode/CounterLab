"""Static policy for runtime-generated CounterLab artifact adapters.

This module is deliberately independent from the execution sandbox.  Passing the
policy is necessary, but never sufficient, to execute generated code safely.
"""

from __future__ import annotations

import ast
import re


_ALLOWED_IMPORT_ROOTS = frozenset(
    {"__future__", "counterlab_sdk", "dataclasses", "typing"}
)
_FORBIDDEN_CALLS = frozenset(
    {
        "__import__",
        "breakpoint",
        "compile",
        "delattr",
        "dir",
        "eval",
        "exec",
        "getattr",
        "globals",
        "help",
        "input",
        "locals",
        "memoryview",
        "open",
        "setattr",
        "vars",
    }
)
_FORBIDDEN_METHODS = frozenset(
    {
        "connect",
        "download",
        "from_url",
        "getenv",
        "install",
        "open",
        "popen",
        "read",
        "read_bytes",
        "read_text",
        "request",
        "run",
        "send",
        "socket",
        "system",
        "unlink",
        "upload",
        "urlopen",
        "write",
        "write_bytes",
        "write_text",
    }
)
_FORBIDDEN_SYNTAX = (
    ast.AsyncFor,
    ast.AsyncWith,
    ast.Await,
    ast.Delete,
    ast.Global,
    ast.Lambda,
    ast.Nonlocal,
    ast.Try,
    ast.With,
    ast.Yield,
    ast.YieldFrom,
)
_SAFE_BUILTIN_CALLS = frozenset(
    {"bool", "dict", "float", "int", "list", "set", "str", "tuple"}
)
_METRIC_IDENTIFIER = re.compile(
    r"(?:^|_)(?:accuracy|auc|f1|metric|precision|recall|roc_auc|score)(?:$|_)",
    re.IGNORECASE,
)
_PREDICTION_IDENTIFIER = re.compile(
    r"(?:^|_)(?:y_true|y_pred|y_score|labels?|predictions?)(?:$|_)",
    re.IGNORECASE,
)


def _call_name(node: ast.expr) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return "dynamic"


def _root_name(node: ast.expr) -> str | None:
    current = node
    while isinstance(current, ast.Attribute):
        current = current.value
    return current.id if isinstance(current, ast.Name) else None


def _target_names(node: ast.AST) -> set[str]:
    return {child.id for child in ast.walk(node) if isinstance(child, ast.Name)}


def _contains_metric_math(node: ast.AST) -> bool:
    has_calculation = any(
        isinstance(child, (ast.BinOp, ast.BoolOp, ast.Compare, ast.comprehension))
        or (
            isinstance(child, ast.Call)
            and _call_name(child.func)
            in {"all", "any", "len", "max", "mean", "min", "round", "sum"}
        )
        for child in ast.walk(node)
    )
    if not has_calculation:
        return False
    identifiers = {
        child.id for child in ast.walk(node) if isinstance(child, ast.Name)
    }
    return any(_PREDICTION_IDENTIFIER.search(name) for name in identifiers)


class _AdapterPolicyVisitor(ast.NodeVisitor):
    def __init__(self, tree: ast.Module) -> None:
        self.violations: set[str] = set()
        self.sdk_modules: set[str] = set()
        self.sdk_symbols: set[str] = set()
        self.declaration_calls: set[str] = set()
        self.local_callables: set[str] = {
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        }

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            root = alias.name.split(".", 1)[0]
            local_name = alias.asname or root
            if root not in _ALLOWED_IMPORT_ROOTS:
                self.violations.add(f"deny_import:{root}")
            elif root == "counterlab_sdk":
                self.sdk_modules.add(local_name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        root = module.split(".", 1)[0]
        if node.level or root not in _ALLOWED_IMPORT_ROOTS:
            self.violations.add(f"deny_import:{root or 'relative'}")
        else:
            for alias in node.names:
                if alias.name == "*":
                    self.violations.add(f"deny_import_star:{root}")
                    continue
                local_name = alias.asname or alias.name
                if root == "counterlab_sdk":
                    self.sdk_symbols.add(local_name)
                elif root == "dataclasses":
                    self.declaration_calls.add(local_name)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr.startswith("_"):
            self.violations.add(f"deny_attribute:{node.attr}")
        elif node.attr in {"environ", "modules"}:
            self.violations.add(f"deny_attribute:{node.attr}")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        name = _call_name(node.func)
        root = _root_name(node.func)
        if _contains_metric_math(node):
            self.violations.add("direct_metric_implementation")
        if name in _FORBIDDEN_CALLS or name in _FORBIDDEN_METHODS:
            self.violations.add(f"deny_call:{name}")
        elif isinstance(node.func, ast.Name):
            allowed = (
                name in self.sdk_symbols
                or name in self.declaration_calls
                or name in self.local_callables
                or name in _SAFE_BUILTIN_CALLS
            )
            if not allowed:
                self.violations.add(f"deny_call:{name}")
        elif isinstance(node.func, ast.Attribute):
            if root not in self.sdk_modules and not (
                isinstance(node.func.value, ast.Name)
                and node.func.value.id in {"self", "cls"}
            ):
                self.violations.add(f"deny_call:{name}")
        else:
            self.violations.add("deny_call:dynamic")
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign) -> None:
        names = set().union(*(_target_names(target) for target in node.targets))
        if (
            any(_METRIC_IDENTIFIER.search(name) for name in names)
            and _contains_metric_math(node.value)
        ) or _contains_metric_math(node):
            self.violations.add("direct_metric_implementation")
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        names = _target_names(node.target)
        if node.value is not None and (
            (
                any(_METRIC_IDENTIFIER.search(name) for name in names)
                and _contains_metric_math(node.value)
            )
            or _contains_metric_math(node)
        ):
            self.violations.add("direct_metric_implementation")
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if _METRIC_IDENTIFIER.search(node.name) and _contains_metric_math(node):
            self.violations.add("direct_metric_implementation")
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.violations.add("deny_syntax:AsyncFunctionDef")
        self.generic_visit(node)

    def generic_visit(self, node: ast.AST) -> None:
        if isinstance(node, _FORBIDDEN_SYNTAX):
            self.violations.add(f"deny_syntax:{type(node).__name__}")
        super().generic_visit(node)


def validate_adapter_source(source: str) -> list[str]:
    """Return deterministic policy violations for a generated adapter source.

    Syntax diagnostics intentionally exclude the source line and parser message so
    an error report cannot echo secrets that a generated file attempted to embed.
    """

    try:
        tree = ast.parse(source, mode="exec")
    except (SyntaxError, ValueError, TypeError):
        return ["syntax_error"]

    visitor = _AdapterPolicyVisitor(tree)
    visitor.visit(tree)
    return sorted(visitor.violations)
