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

The adapter is parsed by a deny-by-default AST policy before it can run. The
container is an additional OS boundary; passing the AST policy alone is never
treated as proof of safe execution.
