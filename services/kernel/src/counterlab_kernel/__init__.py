"""CounterLab's fixed, deterministic evidence kernel."""

from .boundary_map import (
    compute_imbalance_boundary_map,
    compute_leakage_boundary_map,
)
from .canonical import canonical_json, sha256_json
from .experiment import run_leakage_experiment, run_leakage_plan
from .fixture import generate_leakage_fixture
from .imbalance import (
    generate_imbalance_fixture,
    run_imbalance_experiment,
    run_imbalance_plan,
)

__all__ = [
    "canonical_json",
    "compute_imbalance_boundary_map",
    "compute_leakage_boundary_map",
    "generate_leakage_fixture",
    "generate_imbalance_fixture",
    "run_imbalance_experiment",
    "run_imbalance_plan",
    "run_leakage_experiment",
    "run_leakage_plan",
    "sha256_json",
]
