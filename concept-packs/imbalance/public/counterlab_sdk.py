"""Public declarative SDK for the CounterLab class-imbalance lab.

The SDK describes fixed operations only. It deliberately contains no data
access, model fitting, metric formulas, threshold implementation, or verifier
logic; those remain owned by the fixed kernel and external verifier.
"""

from dataclasses import dataclass
from typing import Literal


Operation = Literal[
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
]
Model = Literal["majority_baseline", "logistic_regression"]
PrevalenceScenario = Literal["observed", "rarer", "more_common"]


@dataclass(frozen=True)
class Run:
    id: str
    operation: Operation
    model: Model
    threshold: float
    prevalence_scenario: PrevalenceScenario
    seed: int = 2603

    def __post_init__(self) -> None:
        if self.operation == "imbalance.majority_baseline":
            if (
                self.model != "majority_baseline"
                or self.threshold != 0.5
                or self.prevalence_scenario != "observed"
            ):
                raise ValueError("majority baseline must use its fixed contract")
        elif self.model != "logistic_regression":
            raise ValueError("model runs require the fixed logistic regression")
        if not 0.05 <= self.threshold <= 0.95:
            raise ValueError("threshold is outside the public bounded range")
        if isinstance(self.seed, bool) or not isinstance(self.seed, int):
            raise ValueError("seed must be an integer")

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "operation": self.operation,
            "model": self.model,
            "threshold": self.threshold,
            "prevalenceScenario": self.prevalence_scenario,
            "seed": self.seed,
        }


@dataclass(frozen=True)
class Experiment:
    runs: tuple[Run, ...]

    def __post_init__(self) -> None:
        expected = {
            "imbalance.majority_baseline",
            "imbalance.stratified_holdout",
            "imbalance.threshold_sweep",
            "imbalance.prevalence_sweep",
        }
        if len(self.runs) != 4 or {run.operation for run in self.runs} != expected:
            raise ValueError("experiment requires each fixed operation exactly once")
        if len({run.seed for run in self.runs}) != 1:
            raise ValueError("all runs must use the same seed")

    def to_dict(self) -> dict[str, object]:
        return {"runs": [run.to_dict() for run in self.runs]}


def sample_experiment(seed: int = 2603) -> Experiment:
    """Return the canonical four-run public contract."""

    return Experiment(
        runs=(
            Run(
                id="majority_baseline",
                operation="imbalance.majority_baseline",
                model="majority_baseline",
                threshold=0.5,
                prevalence_scenario="observed",
                seed=seed,
            ),
            Run(
                id="stratified_model",
                operation="imbalance.stratified_holdout",
                model="logistic_regression",
                threshold=0.5,
                prevalence_scenario="observed",
                seed=seed,
            ),
            Run(
                id="lower_threshold",
                operation="imbalance.threshold_sweep",
                model="logistic_regression",
                threshold=0.25,
                prevalence_scenario="observed",
                seed=seed,
            ),
            Run(
                id="rarer_prevalence",
                operation="imbalance.prevalence_sweep",
                model="logistic_regression",
                threshold=0.25,
                prevalence_scenario="rarer",
                seed=seed,
            ),
        )
    )


__all__ = ["Experiment", "Run", "sample_experiment"]
