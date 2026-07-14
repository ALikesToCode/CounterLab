from importlib import import_module

from counterlab_sdk import Experiment, Run


def _build() -> Experiment:
    adapter = import_module("artifact-adapter")
    return adapter.build_experiment()


def test_adapter_declares_only_the_three_required_runs() -> None:
    experiment = _build()

    assert isinstance(experiment, Experiment)
    assert isinstance(experiment.runs, tuple)
    assert len(experiment.runs) == 3
    assert all(isinstance(run, Run) for run in experiment.runs)
    assert tuple(run.id for run in experiment.runs) == (
        "random_row_split",
        "customer_group_split",
        "identity_ablation",
    )


def test_adapter_declares_the_artifact_specific_interventions() -> None:
    random_run, group_run, ablation_run = _build().runs

    assert random_run.split == "random"
    assert group_run.split == "group"
    assert group_run.group_by == "customer_id"
    assert ablation_run.split == "random"
    assert ablation_run.drop_features == ("customer_id",)


def test_adapter_pins_the_public_fixture_seed() -> None:
    assert tuple(run.seed for run in _build().runs) == (1729, 1729, 1729)
