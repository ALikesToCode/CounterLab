# Leakage Concept Pack — public generation contract

Runtime Codex receives this directory, the approved Belief Test, redacted
schema/evidence references, and an empty session workspace. It does not receive
the frozen verifier, mutation catalogue, held-out fixtures, secrets, or the
repository root.

The generated workspace must contain exactly:

```text
experiment-plan.json
artifact-adapter.py
public_tests.py
```

`artifact-adapter.py` may import `Experiment` and `Run` from `counterlab_sdk`.
It exports `build_experiment()` and declares the fixed random-row,
customer-group, and identity-ablation runs. The adapter never reads data and
never implements splitting, training, metrics, or verification. Those remain
host-owned.

The public constructors are deliberately narrow. `Experiment` accepts only a
`runs` tuple; it does not accept a dataset name or adapter argument. Each
`Run` accepts `id`, `split`, optional `group_by`, optional `drop_features`, the
fixed model name, and the seed. A valid adapter has this shape:

```python
from counterlab_sdk import Experiment, Run


def build_experiment() -> Experiment:
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
```

Keep seed `1729` across all three runs so the generated declaration reproduces
the frozen public fixture contract. Syntax checks must direct bytecode outside
the workspace with `PYTHONPYCACHEPREFIX=/tmp/...`; the workspace must still
contain exactly the three declared files when generation ends.

The adapter is parsed by a deny-by-default AST policy before it can run. The
container is an additional OS boundary; passing the AST policy alone is never
treated as proof of safe execution.
