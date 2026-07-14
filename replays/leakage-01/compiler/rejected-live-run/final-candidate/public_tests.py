"""Public contract checks for the generated leakage experiment declaration."""

import importlib.util
import unittest


def _load_build_experiment():
    spec = importlib.util.spec_from_file_location(
        "artifact_adapter", "artifact-adapter.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("artifact-adapter.py could not be loaded")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_experiment


class ExperimentDeclarationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.experiment = _load_build_experiment()()
        cls.runs = {run.id: run for run in cls.experiment.runs}

    def test_declares_exactly_the_three_approved_runs(self):
        self.assertEqual(
            set(self.runs),
            {
                "random_row_split",
                "customer_group_split",
                "identity_ablation",
            },
        )

    def test_all_runs_hold_model_and_seed_constant(self):
        for run in self.runs.values():
            self.assertEqual(run.model, "logistic_regression")
            self.assertEqual(run.seed, 42)

    def test_group_run_uses_the_customer_boundary(self):
        run = self.runs["customer_group_split"]
        self.assertEqual(run.split, "group")
        self.assertEqual(run.group_by, "customer_id")

    def test_identity_ablation_removes_only_customer_identity(self):
        run = self.runs["identity_ablation"]
        self.assertEqual(run.split, "random")
        self.assertEqual(tuple(run.drop_features), ("customer_id",))


if __name__ == "__main__":
    unittest.main()
