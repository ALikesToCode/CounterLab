from __future__ import annotations

import importlib.util
from pathlib import Path


adapter_path = Path(__file__).resolve().with_name("artifact-adapter.py")
spec = importlib.util.spec_from_file_location("artifact_adapter", adapter_path)
assert spec is not None and spec.loader is not None
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
experiment = adapter.build_experiment()
assert {run.id for run in experiment.runs} == {
    "random_row_split",
    "customer_group_split",
    "identity_ablation",
}
