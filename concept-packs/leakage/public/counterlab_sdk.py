"""Public declarative SDK for the CounterLab entity-leakage lab.

Generated adapters can describe the three fixed runs.  This module deliberately
contains no data access, splitting, model training, metrics, or verifier logic.
"""

from dataclasses import dataclass, field
from typing import Literal


RunId = Literal[
    "random_row_split", "customer_group_split", "identity_ablation"
]
Split = Literal["random", "group"]


@dataclass(frozen=True)
class Run:
    id: RunId
    split: Split
    group_by: str | None = None
    drop_features: tuple[str, ...] = field(default_factory=tuple)
    model: str = "logistic_regression"
    seed: int = 1729

    def __post_init__(self) -> None:
        if self.id not in {
            "random_row_split",
            "customer_group_split",
            "identity_ablation",
        }:
            raise ValueError("run id is outside the public leakage contract")
        if self.split not in {"random", "group"}:
            raise ValueError("split is outside the public leakage contract")
        if self.model != "logistic_regression":
            raise ValueError("model is fixed by the public leakage contract")
        if isinstance(self.seed, bool) or not isinstance(self.seed, int):
            raise ValueError("seed must be an integer")
        if not isinstance(self.drop_features, tuple) or not all(
            isinstance(item, str) for item in self.drop_features
        ):
            raise ValueError("drop_features must be a tuple of field names")

        expected = {
            "random_row_split": ("random", None, ()),
            "customer_group_split": ("group", "customer_id", ()),
            "identity_ablation": ("random", None, ("customer_id",)),
        }[self.id]
        observed = (self.split, self.group_by, self.drop_features)
        if observed != expected:
            raise ValueError("run variables do not match the fixed leakage intervention")

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "split": self.split,
            "groupBy": self.group_by,
            "dropFeatures": list(self.drop_features),
            "model": self.model,
            "seed": self.seed,
        }


@dataclass(frozen=True)
class Experiment:
    runs: tuple[Run, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.runs, tuple):
            raise ValueError("runs must be an immutable tuple")
        expected = {
            "random_row_split",
            "customer_group_split",
            "identity_ablation",
        }
        observed = {run.id for run in self.runs}
        if len(self.runs) != 3 or observed != expected:
            raise ValueError("experiment requires exactly one of each fixed leakage run")
        seeds = {run.seed for run in self.runs}
        if len(seeds) != 1:
            raise ValueError("all runs must use the same seed")

    def to_dict(self) -> dict[str, object]:
        return {"runs": [run.to_dict() for run in self.runs]}


__all__ = ["Experiment", "Run"]
