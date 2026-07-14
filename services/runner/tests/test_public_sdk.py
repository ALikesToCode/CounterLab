from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


SDK_PATH = (
    Path(__file__).resolve().parents[3]
    / "concept-packs"
    / "leakage"
    / "public"
    / "counterlab_sdk.py"
)


def _load_sdk():
    spec = importlib.util.spec_from_file_location("counterlab_sdk", SDK_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_public_sdk_serializes_only_the_declarative_experiment_contract() -> None:
    sdk = _load_sdk()
    experiment = sdk.Experiment(
        runs=(
            sdk.Run(id="random_row_split", split="random", seed=1729),
            sdk.Run(
                id="customer_group_split",
                split="group",
                group_by="customer_id",
                seed=1729,
            ),
            sdk.Run(
                id="identity_ablation",
                split="random",
                drop_features=("customer_id",),
                seed=1729,
            ),
        )
    )

    assert experiment.to_dict() == {
        "runs": [
            {
                "id": "random_row_split",
                "split": "random",
                "groupBy": None,
                "dropFeatures": [],
                "model": "logistic_regression",
                "seed": 1729,
            },
            {
                "id": "customer_group_split",
                "split": "group",
                "groupBy": "customer_id",
                "dropFeatures": [],
                "model": "logistic_regression",
                "seed": 1729,
            },
            {
                "id": "identity_ablation",
                "split": "random",
                "groupBy": None,
                "dropFeatures": ["customer_id"],
                "model": "logistic_regression",
                "seed": 1729,
            },
        ]
    }


@pytest.mark.parametrize(
    "run",
    [
        {
            "id": "customer_group_split",
            "split": "group",
            "group_by": None,
        },
        {
            "id": "identity_ablation",
            "split": "random",
            "drop_features": (),
        },
        {"id": "extra", "split": "random"},
        {"id": "random_row_split", "split": "time"},
    ],
)
def test_public_sdk_rejects_contracts_outside_the_leakage_pack(run: dict[str, object]) -> None:
    sdk = _load_sdk()

    with pytest.raises(ValueError):
        sdk.Run(**run)


def test_public_sdk_requires_exactly_one_of_each_fixed_run() -> None:
    sdk = _load_sdk()
    random_run = sdk.Run(id="random_row_split", split="random")

    with pytest.raises(ValueError, match="exactly"):
        sdk.Experiment(runs=(random_run, random_run, random_run))
