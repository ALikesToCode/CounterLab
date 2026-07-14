"""Artifact-specific declarations for the fixed CounterLab leakage SDK."""

from counterlab_sdk import Experiment, Run


def build_experiment():
    """Declare the controlled runs; the fixed SDK owns all computation."""

    return Experiment(
        runs=(
            Run(
                id="random_row_split",
                split="random",
                model="logistic_regression",
                seed=42,
            ),
            Run(
                id="customer_group_split",
                split="group",
                group_by="customer_id",
                model="logistic_regression",
                seed=42,
            ),
            Run(
                id="identity_ablation",
                split="random",
                drop_features=("customer_id",),
                model="logistic_regression",
                seed=42,
            ),
        ),
    )
