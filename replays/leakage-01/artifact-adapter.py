from counterlab_sdk import Experiment, Run


def build_experiment() -> Experiment:
    """Declare interventions; the fixed host kernel computes every metric."""

    return Experiment(
        runs=(
            Run(id="random_row_split", split="random", seed=1729),
            Run(
                id="customer_group_split",
                split="group",
                group_by="customer_id",
                seed=1729,
            ),
            Run(
                id="identity_ablation",
                split="random",
                drop_features=("customer_id",),
                seed=1729,
            ),
        )
    )
