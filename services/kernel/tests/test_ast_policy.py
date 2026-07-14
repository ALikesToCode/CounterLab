from __future__ import annotations

import pytest

from counterlab_kernel.policy import validate_adapter_source


def test_safe_adapter_can_only_compose_public_sdk_calls() -> None:
    source = """from counterlab_sdk import Experiment, Run\n\ndef build():\n    return Experiment(runs=[Run(split='group', group_by='customer_id')])\n"""

    assert validate_adapter_source(source) == []


def test_safe_adapter_allows_future_typing_and_dataclass_declarations() -> None:
    source = """from __future__ import annotations
from dataclasses import dataclass
from typing import Final
from counterlab_sdk import Experiment, Run

DEFAULT_SEED: Final[int] = 1729

@dataclass(frozen=True)
class Adapter:
    group_by: str = "customer_id"

    def build(self) -> Experiment:
        return Experiment(runs=[Run(split="group", group_by=self.group_by, seed=DEFAULT_SEED)])
"""

    assert validate_adapter_source(source) == []


@pytest.mark.parametrize(
    ("source", "rule"),
    [
        ("open('/etc/passwd').read()", "deny_call:open"),
        ("import os", "deny_import:os"),
        ("from subprocess import run", "deny_import:subprocess"),
        ("eval('1 + 1')", "deny_call:eval"),
        ("__import__('socket')", "deny_call:__import__"),
        ("import requests", "deny_import:requests"),
        ("getattr(object(), '__class__')", "deny_call:getattr"),
        ("import counterlab_sdk as sdk\nleak = sdk.__dict__", "deny_attribute:__dict__"),
        ("from pathlib import Path", "deny_import:pathlib"),
        ("import counterlab_sdk as sdk\nsdk.urlopen('https://example.test')", "deny_call:urlopen"),
        ("accuracy = sum(y_true == y_pred) / len(y_true)", "direct_metric_implementation"),
        (
            "def roc_auc_score(y_true, y_score):\n    return sum(y_score) / len(y_score)",
            "direct_metric_implementation",
        ),
        (
            "def compute(y_true, y_pred):\n    return sum(y_true == y_pred) / len(y_true)",
            "direct_metric_implementation",
        ),
    ],
)
def test_ast_policy_rejects_escape_and_metric_implementation(source: str, rule: str) -> None:
    violations = validate_adapter_source(source)

    assert rule in violations


def test_ast_policy_refuses_invalid_python_without_leaking_source() -> None:
    violations = validate_adapter_source("def broken(:\n    secret = 'do-not-log'")

    assert violations == ["syntax_error"]
