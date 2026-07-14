from __future__ import annotations

import pytest

from counterlab_kernel.policy import validate_adapter_source


def test_safe_adapter_can_only_compose_public_sdk_calls() -> None:
    source = """from counterlab_sdk import Experiment, Run\n\ndef build():\n    return Experiment(runs=[Run(split='group', group_by='customer_id')])\n"""

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
        ("accuracy = sum(y_true == y_pred) / len(y_true)", "direct_metric_implementation"),
    ],
)
def test_ast_policy_rejects_escape_and_metric_implementation(source: str, rule: str) -> None:
    violations = validate_adapter_source(source)

    assert rule in violations

